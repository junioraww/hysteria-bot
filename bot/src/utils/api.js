const DOCKER_ADDR = "127.0.0.1"
const HYSTERIA_API = "http://" + DOCKER_ADDR + ":9999"

export function hysteriaCall(route, body = null) {
    return fetch(HYSTERIA_API + route, {
        headers: {
            "Authorization": process.env.TRAFFIC_STATS_SECRET,
        },
        ...(body && JSON.stringify(body))
    })
}
