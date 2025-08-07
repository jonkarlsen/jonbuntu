import platform

import httpx
import psutil
from fastapi import Depends, FastAPI, Header, HTTPException, Request

app = FastAPI()


USERINFO_ENDPOINT = "https://api.vipps.no/vipps-userinfo-api/userinfo"


async def get_user_info(authorization: str | None = Header(default=None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {authorization}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401)
    return resp.json()


@app.get("/")
async def root(user_info: dict = Depends(get_user_info)):
    return user_info


@app.get("/test")
async def test(request: Request):
    return dict(request.headers)


@app.get("/system")
async def system() -> dict:
    info = {}

    info["system"] = platform.system()
    info["node_name"] = platform.node()
    info["release"] = platform.release()
    info["version"] = platform.version()
    info["machine"] = platform.machine()
    info["processor"] = platform.processor()

    info["cpu_count_physical"] = psutil.cpu_count(logical=False)
    info["cpu_count_logical"] = psutil.cpu_count(logical=True)
    info["cpu_freq"] = psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
    info["cpu_percent"] = psutil.cpu_percent(interval=1)

    virtual_mem = psutil.virtual_memory()
    info["virtual_memory"] = virtual_mem._asdict()

    swap = psutil.swap_memory()
    info["swap_memory"] = swap._asdict()

    partitions = []
    for p in psutil.disk_partitions():
        usage = psutil.disk_usage(p.mountpoint)
        partitions.append(
            {
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "opts": p.opts,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "percent_used": usage.percent,
            }
        )
    info["disk_partitions"] = partitions

    net_io = psutil.net_io_counters()
    info["network_io"] = net_io._asdict()

    net_if_addrs = {}
    for interface_name, interface_addresses in psutil.net_if_addrs().items():
        net_if_addrs[interface_name] = []
        for addr in interface_addresses:
            net_if_addrs[interface_name].append(
                {
                    "family": str(addr.family),
                    "address": addr.address,
                    "netmask": addr.netmask,
                    "broadcast": addr.broadcast,
                    "ptp": addr.ptp,
                }
            )
    info["network_interfaces"] = net_if_addrs

    info["boot_time"] = psutil.boot_time()

    return info
