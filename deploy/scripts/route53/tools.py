import httpx


 
async def get_public_ip():
    async with httpx.AsyncClient() as client:
        response = await client.get('https://api.ipify.org')
        response.raise_for_status()
        return response.text.strip()
