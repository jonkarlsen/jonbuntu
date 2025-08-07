import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request

app = FastAPI()


USERINFO_ENDPOINT = "https://api.vipps.no/vipps-userinfo-api/userinfo"


async def get_user_info(authorization: str | None = Header(default=None)) -> dict:
    print("entry")
    print(authorization)
    if not authorization:
        print("no headers!")
        raise HTTPException(status_code=401)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        print(resp.status_code)
        print(resp.text)
        raise HTTPException(status_code=401)
    return resp.json()


@app.get("/")
async def root(user_info: dict = Depends(get_user_info)):
    return user_info


@app.get("/test")
async def test(request: Request):
    return dict(request.headers)
