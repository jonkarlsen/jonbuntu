import httpx
import asyncio

HOSTED_ZONES = {
    "jonkanon.com": "Z0202149XO50CQT3021X",
    "karlsen.casa": "Z066703035QBUBZ8YZJ03",
}
AWS_PROFILE = "route53"

async def get_public_ip():
    async with httpx.AsyncClient() as client:
        response = await client.get('https://api.ipify.org')
        response.raise_for_status()
        return response.text.strip()


async def prompt() -> tuple[str, str, str, bool]:
    domain = input("Domain (jonkanon.com or karlsen.casa): ").strip()
    sub = input("Subdomain: ").strip()
    port = input("Port: ").strip()
    oidc = input("Enable OIDC? (y/n): ").lower() == "y"
    return domain, f"{sub}.{domain}", port, oidc


async def amain() -> None:
    domain, full, port, oidc = await prompt()
    print(domain)
    print(full)
    print(port)
    print(oidc)


def main():
    asyncio.run(amain())
