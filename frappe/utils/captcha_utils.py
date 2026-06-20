import requests
import frappe

class CaptchaUtils:
    """Reusable Captcha Utility Class"""
    
    # Default configuration
    DEFAULT_SECRET_KEY = "6Lery8osAAAAAI7iEn06SKmWSVoldHA-KraVV5Xl"
    
    @staticmethod
    @frappe.whitelist(allow_guest=True)
    def verify_captcha(response, secret_key=None):
        """Verify Google reCAPTCHA v2"""
        
        if not response:
            return {"verified": False, "error": "No captcha response"}
        
        secret = secret_key or CaptchaUtils.DEFAULT_SECRET_KEY
        
        try:
            verification = requests.post(
                'https://www.google.com/recaptcha/api/siteverify',
                data={
                    'secret': secret,
                    'response': response,
                    'remoteip': frappe.local.request_ip if frappe.local.request_ip else None
                },
                timeout=10
            )
            
            result = verification.json()
            
            if result.get('success'):
                return {"verified": True}
            else:
                error_codes = result.get('error-codes', [])
                frappe.log_error(f"Captcha failed: {error_codes}", "Captcha")
                return {"verified": False, "errors": error_codes}
                
        except Exception as e:
            frappe.log_error(f"Captcha exception: {str(e)}", "Captcha")
            return {"verified": False, "error": str(e)}
    
    @staticmethod
    def get_captcha_script(site_key="6Lery8osAAAAAIvNfDE7w9rNEA5etF5cGkWlD4tY"):
        """Get captcha script HTML"""
        return f"""
        <script src="https://www.google.com/recaptcha/api.js?render=explicit" async defer></script>
        <script>
            window.CAPTCHA_SITE_KEY = "{site_key}";
        </script>
        """