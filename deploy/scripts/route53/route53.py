import asyncio
import aioboto3
import httpx

async def get_public_ip():
    async with httpx.AsyncClient() as client:
        response = await client.get('https://api.ipify.org')
        response.raise_for_status()
        return response.text.strip()

async def get_current_dns_ip(hosted_zone_id: str, record_name: str):
    session = aioboto3.Session()
    async with session.client('route53') as client:
        response = await client.list_resource_record_sets(
            HostedZoneId=hosted_zone_id,
            StartRecordName=record_name,
            StartRecordType='A',
            MaxItems='1',
        )
        record_sets = response.get("ResourceRecordSets", [])
        if record_sets and record_sets[0]["Name"] == record_name and record_sets[0]["Type"] == "A":
            records = record_sets[0].get("ResourceRecords", [])
            if records:
                return records[0]["Value"]
        return None

async def update_route53_ip(ip: str, hosted_zone_id: str, record_name: str):
    session = aioboto3.Session()
    async with session.client('route53') as client:
        response = await client.change_resource_record_sets(
            HostedZoneId=hosted_zone_id,
            ChangeBatch={
                "Changes": [
                    {
                        "Action": "UPSERT",
                        "ResourceRecordSet": {
                            "Name": record_name,
                            "Type": "A",
                            "TTL": 300,
                            "ResourceRecords": [{"Value": ip}],
                        },
                    },
                ]
            },
        )
        return response

async def main():
    records = [
        ("Z0202149XO50CQT3021X", "home.jonkanon.com."),
        ("Z066703035QBUBZ8YZJ03", "karlsen.casa."),
    ]

    print("Getting public IP...")
    ip = await get_public_ip()
    print(f"Public IP is {ip}")

    print("Getting current DNS IP...")

    for zone_id, record_name in records:
        print(f"\nChecking DNS record {record_name} in zone {zone_id}...")
        current_ip = await get_current_dns_ip(zone_id, record_name)
        print(f"Current DNS IP is {current_ip}")

        if ip == current_ip:
            print("IP address unchanged, no update needed.")
        else:
            print("IP address changed, updating Route53 record...")
            response = await update_route53_ip(ip, zone_id, record_name)
            print("Route53 update response:", response)

def main_sync():
    asyncio.run(main())

if __name__ == "__main__":
    asyncio.run(main())

