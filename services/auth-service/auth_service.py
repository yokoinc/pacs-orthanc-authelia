from fastapi import FastAPI, Request, Header, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets
import uuid
import time
import json
import redis

app = FastAPI()
security = HTTPBasic()

# Redis connection
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

VALID_USERS = {
    "share-user": "change-me"
}

TOKENS = {
    "admin-token": "admin-role",
    "doctor-token": "doctor-role",
    "external-token": "external-role",
    "admin": "admin-role",  # Direct group mapping from nginx
    "doctor": "doctor-role",
    "external": "external-role"
}

def store_token(token: str, token_data: dict):
    """Store token in Redis with expiration"""
    expiration_time = int(token_data["expires_at"] - time.time())
    if expiration_time > 0:
        redis_client.setex(f"token:{token}", expiration_time, json.dumps(token_data))

def get_token(token: str) -> dict:
    """Get token from Redis"""
    data = redis_client.get(f"token:{token}")
    if data:
        return json.loads(data)
    return None

def delete_token(token: str):
    """Delete token from Redis"""
    redis_client.delete(f"token:{token}")

def increment_token_usage(token: str) -> bool:
    """Increment token usage counter, return False if max reached"""
    data = get_token(token)
    if not data:
        return False
    
    data["current_uses"] = data.get("current_uses", 0) + 1
    
    # Check if max uses exceeded
    if data["current_uses"] >= data.get("max_uses", 999999):
        delete_token(token)
        return False
    
    # Update in Redis
    expiration_time = int(data["expires_at"] - time.time())
    if expiration_time > 0:
        redis_client.setex(f"token:{token}", expiration_time, json.dumps(data))
    
    return True

def verify_basic_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_password = VALID_USERS.get(credentials.username)
    if not correct_password or not secrets.compare_digest(credentials.password, correct_password):
        raise HTTPException(status_code=401)
    return credentials.username

@app.get("/settings/roles")
def get_settings_roles(username: str = Depends(verify_basic_auth)):
    # Return roles and permissions adapted to our PACS environment
    # OHIF, VolView, Explorer 2 - no Osimis
    return {
        "roles": [
            "admin-role",
            "doctor-role", 
            "external-role"
        ],
        "permissions": [
            "view",           # Read access to studies/series/instances
            "download",       # Download DICOM files
            "upload",         # Upload new DICOM files
            "delete",         # Delete studies/series/instances
            "modify",         # Modify DICOM tags
            "anonymize",      # Anonymize DICOM data
            "share",          # Create share links (Explorer 2)
            "send",           # Send to modalities/peers
            "edit-labels",    # Edit study/series labels
            "settings"        # System settings access
        ],
        "available-viewers": [
            "ohif-viewer-publication",
            "viewer-instant-link"
        ],
        "default-viewer": "ohif-viewer-publication"
    }

@app.post("/tokens/validate")
async def validate_token(request: Request, username: str = Depends(verify_basic_auth)):
    body = await request.json()
    print(f"DEBUG - Token validation request: {body}")
    
    token_value = body.get("token-value", "")
    level = body.get("level", "")
    method = body.get("method", "")
    orthanc_id = body.get("orthanc-id", "")
    dicom_uid = body.get("dicom-uid", "")
    uri = body.get("uri", "")
    
    # Check static tokens (user sessions)
    if token_value in TOKENS:
        role = TOKENS[token_value]
        granted = check_permission_for_role(role, level, method, uri)
        return JSONResponse(content={
            "granted": granted,
            "validity": 300  # Cache for 5 minutes
        })
    
    # Check generated share tokens in Redis
    token_data = get_token(token_value)
    if token_data:
        # Check if token has expired (Redis auto-expires, but double-check)
        if time.time() >= token_data["expires_at"]:
            delete_token(token_value)
            return JSONResponse(content={
                "granted": False,
                "validity": 0
            })
        
        # Increment usage counter and check limits
        if not increment_token_usage(token_value):
            return JSONResponse(content={
                "granted": False,
                "validity": 0
            })
        
        # For share tokens, check if the requested resource matches the token's resources
        granted = check_resource_access(token_data, level, method, orthanc_id, dicom_uid, uri)
        
        return JSONResponse(content={
            "granted": granted,
            "validity": 60  # Cache for 1 minute for share tokens
        })
    
    # Token not found
    return JSONResponse(content={
        "granted": False,
        "validity": 0
    })

def check_permission_for_role(role: str, level: str, method: str, uri: str) -> bool:
    """Check if a role has permission for the requested action"""
    if role == "admin-role":
        return True  # Admin can do everything
    elif role == "doctor-role":
        # Doctors can read, upload, share but not delete/modify system
        if method in ["get", "post"] and level in ["patient", "study", "series", "instance", "system"]:
            return True
        if method == "put" and "tokens" in (uri or ""):  # Allow token creation for sharing
            return True
        return False
    elif role == "external-role":
        # External users can only read
        return method == "get" and level in ["patient", "study", "series", "instance"]
    
    return False

def check_resource_access(token_data: dict, level: str, method: str, orthanc_id: str, dicom_uid: str, uri: str) -> bool:
    """Check if a share token allows access to the requested resource"""
    # Share tokens are read-only
    if method != "get":
        return False
    
    # System level access not allowed for share tokens (except specific URIs)
    if level == "system":
        # Allow some system URIs needed for viewers
        allowed_system_uris = ["/system", "/plugins", "/dicom-web/servers"]
        return any(allowed_uri in (uri or "") for allowed_uri in allowed_system_uris)
    
    # Check if the requested resource is covered by this token
    token_resources = token_data.get("resources", [])
    
    for resource in token_resources:
        token_orthanc_id = resource.get("orthanc-id", "")
        token_dicom_uid = resource.get("dicom-uid", "")
        token_level = resource.get("level", "")
        
        # Exact match
        if orthanc_id == token_orthanc_id or dicom_uid == token_dicom_uid:
            return True
            
        # Hierarchical access: if token is for a study, allow access to its series/instances
        if token_level == "study" and level in ["series", "instance"]:
            # We'd need to query Orthanc to check hierarchy, for now allow it
            return True
        elif token_level == "series" and level == "instance":
            return True
    
    return False

@app.post("/user/get-profile")
async def get_user_profile(request: Request):
    # Manual basic auth parsing
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Missing Basic auth")
    
    try:
        import base64
        encoded_credentials = auth_header[6:]  # Remove "Basic "
        decoded_credentials = base64.b64decode(encoded_credentials).decode('utf-8')
        username, password = decoded_credentials.split(":", 1)
        
        if username != "share-user" or password != "change-me":
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth format")
    
    body = await request.json()
    print("DEBUG - Request body:", body)
    
    # Get user info from request body (sent by Authorization plugin)
    token_value = body.get("token-value", "")
    print(f"DEBUG - Token value: {token_value}")
    
    # The token-value contains the group from nginx headers
    group = token_value
    
    # Map Authelia group to user permissions
    if "admin" in group:
        user_name = "Administrator"
        permissions = ["view", "download", "upload", "delete", "modify", "anonymize", "share", "send", "settings", "edit-labels"]
    elif "doctor" in group:
        user_name = "Doctor"
        permissions = ["view", "download", "upload", "share", "send", "edit-labels"]
    else:
        user_name = "External User"
        permissions = ["view", "download"]
    
    return JSONResponse(content={
        "name": user_name,
        "authorized-labels": ["*"],  # Access to all labels
        "permissions": permissions,
        "validity": 60
    })

@app.post("/tokens/{token_type}")
@app.put("/tokens/{token_type}")
async def create_token(token_type: str, request: Request):
    # Check Authelia authentication headers
    remote_user = request.headers.get("Remote-User")
    remote_groups = request.headers.get("Remote-Groups")
    
    if not remote_user or not remote_groups:
        raise HTTPException(status_code=401, detail="Missing authentication headers")
    
    body = await request.json()
    print(f"DEBUG - Creating token type: {token_type}, body: {body}")
    
    # Extract parameters from Authorization plugin request
    request_id = body.get("id", "")
    resources = body.get("resources", [])
    expiration_date = body.get("expiration-date")
    validity_duration = body.get("validity-duration", 7 * 24 * 3600)  # 7 days default
    
    # Generate unique token
    token = str(uuid.uuid4())
    
    # Log the token type for debugging
    print(f"DEBUG - Token type requested: {token_type}")
    
    # Store token in Redis with expiration and resources
    token_data = {
        "token_type": token_type,
        "request_id": request_id,
        "resources": resources,
        "role": "external-role",  # Share tokens are read-only
        "expires_at": time.time() + validity_duration,
        "created_at": time.time(),
        "max_uses": 50,  # Maximum 50 utilisations
        "current_uses": 0  # Compteur d'utilisations
    }
    store_token(token, token_data)
    
    # Generate share URL based on token type - use decode endpoint for proper redirection
    share_url = f"https://pacs.yokoinc.ovh/ui/app/share-landing.html?token={token}"
    
    return JSONResponse(content={
        "request": body,  # Copy of the request
        "token": token,
        "url": share_url
    })

@app.post("/tokens/decode")
async def decode_token(request: Request):
    body = await request.json()
    print(f"DEBUG - Decoding token, body: {body}")
    
    token_key = body.get("token-key", "")
    token_value = body.get("token-value", "")
    
    # Check if token exists and is valid in Redis
    token_data = get_token(token_value)
    if not token_data:
        return JSONResponse(content={
            "error-code": "unknown"
        })
    
    # Check if token has expired
    if time.time() >= token_data["expires_at"]:
        # Remove expired token
        delete_token(token_value)
        return JSONResponse(content={
            "error-code": "expired"
        })
    
    # Get the first resource (usually there's only one for shares)
    resources = token_data.get("resources", [])
    if not resources:
        return JSONResponse(content={
            "error-code": "invalid"
        })
    
    resource = resources[0]
    orthanc_id = resource.get("orthanc-id", "")
    level = resource.get("level", "study")
    token_type = token_data.get("token_type", "")
    
    # Generate redirect URL based on token type and resource
    if token_type == "ohif-viewer-publication":
        redirect_url = f"https://pacs.yokoinc.ovh/ohif/?StudyInstanceUIDs={orthanc_id}&token={token_value}"
    elif token_type == "viewer-instant-link":
        # Instant viewer link - redirects to public share endpoint
        redirect_url = f"https://pacs.yokoinc.ovh/share/?token={token_value}#{level}s/{orthanc_id}"
    else:
        # Default to public share endpoint
        redirect_url = f"https://pacs.yokoinc.ovh/share/?token={token_value}#{level}s/{orthanc_id}"
    
    return JSONResponse(content={
        "token-type": token_type,
        "redirect-url": redirect_url
    })

@app.get("/health")
def health_check():
    return JSONResponse(content={
        "status": "healthy",
        "service": "auth-service",
        "version": "1.0.0"
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)