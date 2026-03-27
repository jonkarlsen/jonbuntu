import httpx
import asyncio
import aioboto3
from pathlib import Path

HOSTED_ZONES = {
    "jonkanon.com": "Z0202149XO50CQT3021X",
    "karlsen.casa": "Z066703035QBUBZ8YZJ03",
}
AWS_PROFILE = "route53"
EMAIL = "karlsen.jon.a@gmail.com"


async def run(cmd: list[str]):
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\n{stderr.decode()}")

    return stdout.decode()


async def get_public_ip():
    async with httpx.AsyncClient() as client:
        response = await client.get('https://api.ipify.org')
        response.raise_for_status()
        return response.text.strip()


async def create_dns_record(domain: str, full: str, ip: str) -> None:
    session = aioboto3.Session(profile_name=AWS_PROFILE)
    async with session.client("route53") as client:
        zone_id = HOSTED_ZONES[domain]
        await client.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                "Comment": "Created from script",
                "Changes": [
                    {
                        "Action": "UPSERT",
                        "ResourceRecordSet": {
                            "Name": full,
                            "Type": "A",
                            "TTL": 300,
                            "ResourceRecords": [{"Value": ip}]
                        }
                    }
                ]
            }
        )
    print(f"Created record: {full} -> {ip}")


async def prompt() -> tuple[str, str, str, bool]:
    domain = input("Domain (jonkanon.com or karlsen.casa): ").strip()
    sub = input("Subdomain: ").strip()
    port = input("Port: ").strip()
    oidc = False
    if domain == "jonkanon.com":
        oidc = input("Enable OIDC? (y/n): ").lower() == "y"
    return domain, f"{sub}.{domain}", port, oidc


async def update_nginx():
    print("hello")
    print(Path(__file__).resolve().parent.parent.parent.parent.parent / "nginx" / "jonbuntu.conf")


async def amain() -> None:
    domain, full, port, oidc = await prompt()
    print(domain)
    print(full)
    print(port)
    print(oidc)
    ip = await get_public_ip()
    await create_dns_record(domain, full, ip)

def main():
    #asyncio.run(amain())
    asyncio.run(update_nginx())
