// ==========================================
// Reusable Captcha Module
// ==========================================
// Save this as captcha_module.js in your app's public/js folder
// Then import in web forms: frappe.require('captcha_module.js')

window.CaptchaModule = (function() {
    'use strict';
    
    // Private variables
    let captchaWidget = null;
    let captchaRendered = false;
    let config = {
        siteKey: "6Lery8osAAAAAIvNfDE7w9rNEA5etF5cGkWlD4tY",
        verifyMethod: "frappe.utils.captcha_utils.verify_captcha",
        containerId: "recaptcha-container",
        autoReset: true,
        debug: false
    };
    
    // Private functions
    function log(message) {
        if (config.debug) {
            console.log("[CaptchaModule]", message);
        }
    }
    
    function loadScript(callback) {
        if (typeof grecaptcha !== 'undefined') {
            callback();
            return;
        }
        
        if (document.querySelector('script[src*="recaptcha/api.js"]')) {
            const checkInterval = setInterval(function() {
                if (typeof grecaptcha !== 'undefined') {
                    clearInterval(checkInterval);
                    callback();
                }
            }, 100);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            setTimeout(callback, 100);
        };
        script.onerror = function() {
            log("Failed to load reCAPTCHA script");
            setTimeout(() => loadScript(callback), 3000);
        };
        document.head.appendChild(script);
    }
    
    // Public API
    return {
        // Initialize captcha on a form
        init: function(formSelector, options = {}) {
            // Merge options
            Object.assign(config, options);
            
            if (formSelector) {
                config.formSelector = formSelector;
            }
            
            log("Initializing captcha module", config);
            
            // Load script and render
            loadScript(() => {
                this.render();
                this.attachSubmitHandler();
                this.watchForChanges();
            });
            
            return this;
        },
        
        // Render captcha
        render: function(containerId = null) {
            const container = document.getElementById(containerId || config.containerId);
            
            if (container && captchaWidget !== null) {
                log("Captcha already rendered");
                return;
            }
            
            let targetContainer = container;
            
            if (!targetContainer) {
                const form = document.querySelector(config.formSelector || 'form');
                if (form) {
                    const div = document.createElement('div');
                    div.className = 'form-group';
                    div.innerHTML = `
                        <div class="col-sm-12">
                            <div id="${config.containerId}" style="margin: 20px 0; display: flex; justify-content: center;"></div>
                        </div>
                    `;
                    const submitBtn = form.querySelector('button[type="submit"], .btn-primary');
                    if (submitBtn) {
                        submitBtn.parentNode.insertBefore(div, submitBtn);
                    } else {
                        form.appendChild(div);
                    }
                    targetContainer = document.getElementById(config.containerId);
                }
            }
            
            if (!targetContainer) {
                setTimeout(() => this.render(), 500);
                return;
            }
            
            if (captchaWidget !== null) {
                try {
                    grecaptcha.reset(captchaWidget);
                    return;
                } catch(e) {
                    captchaWidget = null;
                }
            }
            
            try {
                targetContainer.innerHTML = '';
                captchaWidget = grecaptcha.render(targetContainer, {
                    sitekey: config.siteKey,
                    callback: function(response) {
                        log("Captcha verified");
                        captchaRendered = true;
                        if (config.onVerify) config.onVerify(response);
                    },
                    "expired-callback": function() {
                        log("Captcha expired");
                        captchaWidget = null;
                        captchaRendered = false;
                        if (config.onExpire) config.onExpire();
                        if (config.autoReset) setTimeout(() => this.render(), 500);
                    },
                    "error-callback": function() {
                        log("Captcha error");
                        captchaWidget = null;
                        captchaRendered = false;
                    }
                });
                log("Captcha rendered");
            } catch(e) {
                log("Render error:", e);
                setTimeout(() => this.render(), 1000);
            }
            
            return this;
        },
        
        // Get captcha response
        getResponse: function() {
            if (captchaWidget && typeof grecaptcha !== 'undefined') {
                try {
                    const response = grecaptcha.getResponse(captchaWidget);
                    return response && response.length > 0 ? response : null;
                } catch(e) {
                    return null;
                }
            }
            return null;
        },
        
        // Reset captcha
        reset: function() {
            if (captchaWidget && typeof grecaptcha !== 'undefined') {
                try {
                    grecaptcha.reset(captchaWidget);
                    captchaRendered = false;
                    log("Captcha reset");
                } catch(e) {
                    captchaWidget = null;
                    this.render();
                }
            }
            return this;
        },
        
        // Verify with server
        verify: function(captchaResponse, callback) {
            frappe.call({
                method: config.verifyMethod,
                args: { response: captchaResponse },
                callback: function(r) {
                    const verified = r.message && r.message.verified;
                    if (callback) callback(verified, r.message);
                },
                error: function() {
                    if (callback) callback(false, null);
                }
            });
        },
        
        // Attach submit handler to form
        attachSubmitHandler: function() {
            const form = document.querySelector(config.formSelector || 'form');
            if (!form) {
                setTimeout(() => this.attachSubmitHandler(), 500);
                return this;
            }
            
            $(form).off('submit.captcha').on('submit.captcha', (e) => {
                e.preventDefault();
                
                // Get all form values
                const formValues = {};
                if (frappe.web_form && frappe.web_form.get_value) {
                    const fields = frappe.web_form.get_fields();
                    fields.forEach(field => {
                        formValues[field.fieldname] = frappe.web_form.get_value(field.fieldname);
                    });
                } else {
                    $(form).serializeArray().forEach(field => {
                        formValues[field.name] = field.value;
                    });
                }
                
                // Run custom validation
                if (config.validate && typeof config.validate === 'function') {
                    const validationResult = config.validate(formValues);
                    if (validationResult !== true) {
                        frappe.msgprint(validationResult);
                        return;
                    }
                }
                
                // Check captcha
                const captchaResponse = this.getResponse();
                if (!captchaResponse) {
                    frappe.msgprint({
                        title: "Verification Required",
                        message: 'Please check the "I am not a robot" box.',
                        indicator: "red"
                    });
                    return;
                }
                
                const $submitBtn = $(form).find('button[type="submit"], .btn-primary');
                const originalText = $submitBtn.html();
                $submitBtn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> Verifying...');
                
                this.verify(captchaResponse, (isValid) => {
                    if (!isValid) {
                        frappe.msgprint({
                            title: "Verification Failed",
                            message: "Captcha verification failed. Please try again.",
                            indicator: "red"
                        });
                        this.reset();
                        $submitBtn.prop("disabled", false).html(originalText);
                        return;
                    }
                    
                    // Run before submit hook
                    if (config.beforeSubmit && typeof config.beforeSubmit === 'function') {
                        config.beforeSubmit(formValues, (proceed, customSubmit) => {
                            if (proceed !== false) {
                                $submitBtn.html('<i class="fa fa-spinner fa-spin"></i> Submitting...');
                                if (customSubmit) {
                                    customSubmit();
                                } else {
                                    $(e.target).off('submit.captcha').submit();
                                }
                            } else {
                                $submitBtn.prop("disabled", false).html(originalText);
                            }
                        });
                    } else {
                        $submitBtn.html('<i class="fa fa-spinner fa-spin"></i> Submitting...');
                        $(e.target).off('submit.captcha').submit();
                    }
                });
            });
            
            return this;
        },
        
        // Watch for DOM changes
        watchForChanges: function() {
            const observer = new MutationObserver(() => {
                const container = document.getElementById(config.containerId);
                if (container && container.innerHTML === '' && captchaWidget === null) {
                    this.render();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            
            $(document).on('form-refresh', () => setTimeout(() => this.render(), 200));
            
            return this;
        },
        
        // Set configuration
        setConfig: function(newConfig) {
            Object.assign(config, newConfig);
            return this;
        },
        
        // Check if captcha is verified
        isVerified: function() {
            return captchaRendered && this.getResponse() !== null;
        }
    };
})();