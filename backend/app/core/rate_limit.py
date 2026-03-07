from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Rate limit constants
RATE_READ = "120/minute"
RATE_WRITE = "60/minute"
RATE_UPLOAD = "20/minute"
RATE_AI = "30/minute"
