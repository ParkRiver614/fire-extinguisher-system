import heapq
from typing import Optional


BLOCKED_STATUSES = {"obstacle_detected", "missing", "fire_detected"}


def dijkstra(
    nodes: list[dict],
    edges: list[dict],
    start: str,
    targets: list[str],
    blocked_nodes: set[str],
) -> Optional[tuple[str, list[str]]]:
    """
    nodes         : [{"floor_node_id": "1", "is_blocked": False, ...}]
    edges         : [{"from": "1", "to": "2", "weight": 12.7, "is_bidirectional": True}]
    start         : 출발 노드 ID (문자열)
    targets       : 목적지 후보 노드 ID 목록
    blocked_nodes : 통행 불가 노드 집합 (is_blocked=True 포함)
    returns       : (가장 가까운 목적지 ID, 경로 리스트) or None
    """
    adj: dict[str, list[tuple[float, str]]] = {}
    for n in nodes:
        adj.setdefault(str(n["floor_node_id"]), [])

    for e in edges:
        f = str(e["from"])
        t = str(e["to"])
        w = float(e["weight"])
        bidir = e.get("is_bidirectional", True)

        adj.setdefault(f, []).append((w, t))
        if bidir:
            adj.setdefault(t, []).append((w, f))

    dist: dict[str, float] = {str(n["floor_node_id"]): float("inf") for n in nodes}
    prev: dict[str, Optional[str]] = {str(n["floor_node_id"]): None for n in nodes}
    dist[start] = 0.0
    pq: list[tuple[float, str]] = [(0.0, start)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for w, v in adj.get(u, []):
            if v in blocked_nodes:
                continue
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    best_target = None
    best_dist = float("inf")
    for t in targets:
        if dist.get(t, float("inf")) < best_dist:
            best_dist = dist[t]
            best_target = t

    if best_target is None or best_dist == float("inf"):
        return None

    path = []
    cur: Optional[str] = best_target
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    path.reverse()

    return best_target, path
