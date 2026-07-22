import heapq
from collections import deque
from typing import Literal, Optional

type edge_km = int
type edge_time = float
type edge_cost = int
type edge = tuple[place, edge_km, edge_time, edge_cost]

class place:
    def __init__(self, name : str,edges : Optional[list[tuple]] = None):
        self.name : str = name 
        self.edges : list[edge] = edges if edges is not None else []

    def add_edge(self, to_place:'place', km:edge_km, time:edge_time, cost:edge_cost):
        self.edges.append((to_place, km, time, cost))


class railway_transportion_sys:
    def __init__(self):
        self.V : list[place] = []


    def to_place(self, name: str) -> Optional[place]:
        for place in self.V:
            if place.name == name:
                return place
        return None

    def add_places(self, *p : str)-> tuple[bool,str]:
        fail = []
        for i in p:
            if self.to_place(i) is not None:
                fail.append(f"place {i} already exists")
            else:
                self.V.append(place(i))
        return (len(fail) == 0, ";".join(fail))
    
    def batch_add_edges(self, edges:list[tuple[str,str,edge_km,edge_time,edge_cost]])-> tuple[bool,dict]:
        fail = {}
        flag = True
        for i in edges:
            p1, p2, km, time, cost = i
            res = self.add_edge(p1, p2, km, time, cost)
            if not res[0]:
                fail[f"{p1} to {p2}"] = res[1]
                flag = False
        return (flag, fail)
        
    def add_edge(self, p1:str, p2:str, km:int, time:float, cost:int)-> tuple[bool,str]:
        p1 = self.to_place(p1)
        p2 = self.to_place(p2)
        if km <= 0 or time <= 0 or cost <= 0:
            return (False, "km, time, cost must be positive")
        if p1.name == p2.name:
            return (False, "p1 and p2 must be different")
        for e in p1.edges:
            if e[0] == p2:
                return (False, "p1 already have edge to p2")
        for e in p2.edges:
            if e[0] == p1:
                return (False, "p2 already have edge to p1")
        p1.add_edge(p2, km, time, cost)
        p2.add_edge(p1, km, time, cost)
        return (True, "")

    def remove_edge(self, p1:str, p2: str)-> tuple[bool,str]:
        p1 = self.to_place(p1)
        p2 = self.to_place(p2)
        if p1 is None or p2 is None:
            return (False, "p1 or p2 not in system")
        for e in p1.edges:
            if e[0] == p2:
                p1.edges.remove(e)
                break
        else:
            return (False, "p1 not have edge to p2")
        for e in p2.edges:
            if e[0] == p1:
                p2.edges.remove(e)
                break
        else:
            return (False, "p2 not have edge to p1")
        return (True, "")
            
    def change_edge(self, p1:str, p2: str,*,km = None,time = None,cost = None)-> tuple[bool,str]:
        """
        修改p1到p2的边的属性
        :param p1: 起始点
        :type p1: 'place'
        :param p2: 终止点
        :type p2: 'place'
        :param km: 边的距离，可选
        :type km: int
        :param time: 边的时间，可选
        :type time: int
        :param cost: 边的成本，可选
        :type cost: int
        :return: 成功：返回True，失败：返回错误原因
        :rtype: tuple[bool,str]
        """
        p1 = self.to_place(p1)
        p2 = self.to_place(p2)
        if p1 is None or p2 is None:
            return (False, "p1 or p2 not in system")
        for e in p1.edges:
            if e[0] == p2:
                n_e = e.copy()
                if km is not None:
                    n_e[1] = km
                if time is not None:
                    n_e[2] = time
                if cost is not None:
                    n_e[3] = cost
                p1.edges.remove(e)
                p2.edges.append(n_e)
                break
        else:
            return (False, "p1 not have edge to p2")
        for e in p2.edges:
            if e[0] == p1:
                n_e = e.copy()
                if km is not None:
                    n_e[1] = km
                if time is not None:
                    n_e[2] = time
                if cost is not None:
                    n_e[3] = cost
                p2.edges.remove(e)
                p1.edges.append(n_e)
                break
        else:
            return (False, "p2 not have edge to p1")  
        return (True, "")
    
    def query_path(self,start:str,end:str,metric:str)->tuple[Literal[True],int,list['place']]|tuple[Literal[False],str]:
        """
        统一查询接口
        :param start: 起始点
        :type start: 'place'
        :param end: 终止点
        :type end: 'place'
        :param metric: 使用的度量标准，如最短距离、最短时间、最低成本、最少中转次数等(对应值为'km','time','cost','transit')
        :type metric: str
        :return: 成功：起始点到终止点的最短距离和路径，失败：返回错误原因
        :rtype: tuple[int,list['place']]

        """
        if metric == 'transit':
            try:
                return (True, *self._BFS(self.to_place(start), self.to_place(end)))
            except ValueError as e:
                return (False, str(e))
        elif metric in ['km', 'time', 'cost']:
            try:
                return (True, *self._dijkstra(self.to_place(start), self.to_place(end), metric))
            except ValueError as e:
                return (False, str(e))
        else:
            return (False, "metric must be 'km','time','cost' or 'transit'")
    

    def _dijkstra(self,start:'place',end:'place',metric:str)->tuple[int,list['place']]:
        """
        dijkstra算法实现
        :param start: 起始点
        :type start: 'place'
        :param end: 终止点
        :type end: 'place'
        :param metric: 使用的度量标准，可选值为'km','time','cost'
        :type metric: str
        :return: 起始点到终止点的最短距离和路径
        :rtype: tuple[int,list['place']]
        """
        if metric not in ['km', 'time', 'cost']:
            raise ValueError("metric must be 'km','time' or 'cost'")
        
        if start not in self.V or end not in self.V:
            raise ValueError("start or end not in V")
        
        dist = {node: float('inf') for node in self.V}
        prev = {node: None for node in self.V}
        dist[start] = 0
        
        pq = [(0, start)]
        
        while pq:
            current_dist, u = heapq.heappop(pq)
            
            if current_dist > dist[u]:
                continue
            
            if u == end:
                break
            
            for v, km, time, cost in u.edges:
                if metric == 'km':
                    weight = km
                elif metric == 'time':
                    weight = time
                else:
                    weight = cost
                    
                new_dist = current_dist + weight
                
                if new_dist < dist[v]:
                    dist[v] = new_dist
                    prev[v] = u
                    heapq.heappush(pq, (new_dist, v))
        
        if dist[end] < float('inf'):
            path = []
            node = end
            while node is not None:
                path.append(node)
                node = prev[node]
            path.reverse()
            return dist[end], path
        else:
            return float('inf'), []
        
    def _BFS(self,start:'place',end:'place')->tuple[int,list['place']]:
        """
        BFS算法实现
        :param start: 起始点
        :type start: 'place'
        :param end: 终止点
        :type end: 'place'
        :return: 起始点到终止点的最少节点长度和路径
        :rtype: tuple[int,list['place']]
        """
        if start not in self.V or end not in self.V:
            raise ValueError("start or end not in V")

        queue = deque([start])

        dist = {node: float('inf') for node in self.V}
        prev = {node: None for node in self.V}
        dist[start] = 0

        while queue:
            u = queue.popleft()
            
            if u == end:
                break
            
            for v, _, _, _ in u.edges:
                if dist[v] == float('inf'):
                    dist[v] = dist[u] + 1
                    prev[v] = u
                    queue.append(v)

        if dist[end] < float('inf'):
            path = []
            node = end
            while node is not None:
                path.append(node)
                node = prev[node]
            path.reverse()
            return dist[end], path
        else:
            return float('inf'), []
        
    def _print_graph(self):
        for i in self.V:
            print(f"{i.name}->{[v.name for v,_,_,_ in i.edges]}")
        print("None")




