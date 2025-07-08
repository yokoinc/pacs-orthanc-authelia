from fastapi import FastAPI, Request, Header, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets

app = FastAPI()
security = HTTPBasic()

VALID_USERS = {
    "share-user": "change-me"
}

TOKENS = {
    "admin-token": "admin-role",
    "doctor-token": "doctor-role",
    "external-token": "external-role"
}

def verify_basic_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_password = VALID_USERS.get(credentials.username)
    if not correct_password or not secrets.compare_digest(credentials.password, correct_password):
        raise HTTPException(status_code=401)
    return credentials.username

@app.get("/settings/roles")
def get_settings_roles(username: str = Depends(verify_basic_auth)):
    return JSONResponse(content={
        "roles": {
            "admin-role": {
                "permissions": [
                    "view",
                    "download",
                    "delete",
                    "send",
                    "modify",
                    "anonymize",
                    "upload",
                    "q-r-remote-modalities",
                    "settings",
                    "edit-labels",
                    "admin-permissions",
                    "share"
                ],
                "authorized-labels": ["*"]
            },
            "doctor-role": {
                "permissions": ["view", "download", "share", "send"],
                "authorized-labels": ["*"]
            },
            "external-role": {
                "permissions": ["view", "download"],
                "authorized-labels": []
            }
        },
        "available-labels": []
    })

@app.post("/tokens/validate")
async def validate_token(request: Request, username: str = Depends(verify_basic_auth)):
    body = await request.json()
    token = body.get("token-value", "")
    return JSONResponse(content={
        "valid": token in TOKENS
    })

@app.post("/user/profile")
def get_user_profile(
    x_auth_user: str = Header(None),
    x_auth_groups: str = Header(None)
):
    if not x_auth_user:
        raise HTTPException(status_code=401)

    group = (x_auth_groups or "").lower()

    role = {
        "doctor": "doctor-role",
        "admin": "admin-role"
    }.get(group, "external-role")

    return JSONResponse(content={
        "labels": [],
        "roles": [role]
    }, media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)