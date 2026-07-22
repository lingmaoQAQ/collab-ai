# generate_railway_data_fixed.py
import json
import random
from datetime import datetime
from typing import List, Dict, Tuple, Set

class CityGenerator:
    """城市生成器"""
    
    def __init__(self):
        self.prefixes = [
            "奥术", "魔法", "巨龙", "精灵", "矮人", "兽人", "亡灵", "血族", "光明", "黑暗",
            "风暴", "火焰", "冰霜", "大地", "雷霆", "星辰", "月光", "日光", "永恒", "时光",
            "荣耀", "勇气", "智慧", "正义", "自由", "命运", "希望", "战争", "和平", "龙喉",
            "银月", "铁炉", "暴风", "洛丹伦", "达拉然", "吉尔尼斯", "库尔提拉斯", "赞达拉", "潘达利亚"
        ]
        
        self.suffixes = [
            "城", "堡", "要塞", "哨站", "港口", "村庄", "小镇", "城市", "王国", "帝国",
            "高地", "平原", "山谷", "森林", "沼泽", "沙漠", "雪山", "海岛", "峡谷", "盆地",
            "圣殿", "神殿", "教堂", "学院", "图书馆", "博物馆", "竞技场", "市场", "广场", "花园"
        ]
        
        self.middles = ["之", "的", "", "-", "·", "与"]
        
    def generate_city_names(self, num_cities: int = 100) -> List[str]:
        """生成城市名称"""
        city_names = set()
        
        # 主要城市
        major_cities = [
            "暴风城", "奥格瑞玛", "铁炉堡", "达纳苏斯", "雷霆崖", "幽暗城", 
            "银月城", "埃索达", "沙塔斯城", "达拉然", "诺莫瑞根", "吉尔尼斯城",
            "洛丹伦废墟", "潘达利亚", "赞达拉", "库尔提拉斯", "纳沙塔尔", "暗影界",
            "炽蓝仙野", "雷文德斯", "玛卓克萨斯", "晋升堡垒"
        ]
        
        for city in major_cities:
            if len(city_names) < num_cities:
                city_names.add(city)
        
        # 生成随机城市
        while len(city_names) < num_cities:
            # 随机选择组合方式
            combo_type = random.choice([1, 2, 3])
            
            if combo_type == 1:
                name = random.choice(self.prefixes) + random.choice(self.suffixes)
            elif combo_type == 2:
                middle = random.choice(self.middles)
                name = random.choice(self.prefixes) + middle + random.choice(self.suffixes)
                if middle == "":
                    name = random.choice(self.prefixes) + random.choice(self.suffixes)
            else:
                name = random.choice(self.prefixes) + random.choice(self.prefixes) + random.choice(self.suffixes)
            
            city_names.add(name)
        
        return list(city_names)[:num_cities]

class RailwayGenerator:
    """铁路网络生成器"""
    
    def __init__(self):
        self.city_gen = CityGenerator()
        
    def _assign_city_levels(self, cities: List[str]) -> Dict[str, int]:
        """分配城市等级"""
        num_cities = len(cities)
        
        # 计算各等级城市数量
        if num_cities <= 20:
            # 小型网络：1个大城市，30%中等城市，其余小城市
            num_major = 1
            num_medium = max(1, int(num_cities * 0.3))
        elif num_cities <= 50:
            # 中型网络：10%大城市，30%中等城市，其余小城市
            num_major = max(1, int(num_cities * 0.1))
            num_medium = max(2, int(num_cities * 0.3))
        else:
            # 大型网络：10%大城市，20%中等城市，其余小城市
            num_major = max(5, int(num_cities * 0.1))
            num_medium = max(10, int(num_cities * 0.2))
        
        num_small = num_cities - num_major - num_medium
        # 确保小城市数量合理
        if num_small < 0:
            num_medium = num_cities - num_major
            num_small = 0
        
        print(f"城市等级分配：大城市 {num_major} 个，中等城市 {num_medium} 个，小城市 {max(0, num_small)} 个")
        
        # 分配等级
        city_levels = {}
        for i, city in enumerate(cities):
            if i < num_major:
                city_levels[city] = 3  # 大城市
            elif i < num_major + num_medium:
                city_levels[city] = 2  # 中等城市
            else:
                city_levels[city] = 1  # 小城市
        
        return city_levels
    
    def _get_max_connections(self, level: int) -> int:
        """根据城市等级获取最大连接数"""
        if level == 3:  # 大城市
            return random.randint(8, 15)
        elif level == 2:  # 中等城市
            return random.randint(4, 8)
        else:  # 小城市
            return random.randint(2, 4)
    
    def generate_railway_data(
        self,
        num_cities: int = 100,
        edge_multiplier: float = 1.5,  # 平均每个城市的边数倍数
        max_km: int = 2000,
        max_time: float = 48.0,
        max_cost: int = 1000
    ) -> Dict:
        """生成优化的铁路网络数据"""
        
        print("生成城市名称...")
        cities = self.city_gen.generate_city_names(num_cities)
        print(f"已生成 {len(cities)} 个城市")
        
        # 分配城市等级
        city_levels = self._assign_city_levels(cities)
        
        # 计算目标边数 - 限制在合理范围内
        target_edges = min(int(num_cities * edge_multiplier), num_cities * 3)
        print(f"目标边数：{target_edges}")
        
        # 创建连接图
        print("创建铁路连接...")
        
        edges = []
        edge_set = set()  # 用于去重
        city_connections = {city: 0 for city in cities}  # 每个城市的连接数
        city_max_connections = {city: self._get_max_connections(city_levels[city]) for city in cities}
        
        # 按城市等级分组
        major_cities = [city for city in cities if city_levels[city] == 3]
        medium_cities = [city for city in cities if city_levels[city] == 2]
        small_cities = [city for city in cities if city_levels[city] == 1]
        
        # 第一阶段：确保每个城市至少有一个连接
        print("第一阶段：确保基本连通性...")
        all_cities = cities.copy()
        random.shuffle(all_cities)
        
        for i in range(0, len(all_cities) - 1, 2):
            if i + 1 >= len(all_cities):
                break
                
            city1 = all_cities[i]
            city2 = all_cities[i + 1]
            
            edge_key = tuple(sorted([city1, city2]))
            if edge_key not in edge_set:
                # 根据城市等级确定距离
                level1 = city_levels[city1]
                level2 = city_levels[city2]
                
                if level1 == 3 or level2 == 3:
                    km = random.randint(200, 800)
                else:
                    km = random.randint(50, 400)
                
                time = round(km / random.uniform(40, 80), 1)
                cost = random.randint(30, int(km * 0.5))
                
                edges.append({
                    "from": city1,
                    "to": city2,
                    "km": km,
                    "time": time,
                    "cost": cost
                })
                
                edge_set.add(edge_key)
                city_connections[city1] += 1
                city_connections[city2] += 1
        
        # 第二阶段：创建区域连接（同等级城市优先连接）
        print("第二阶段：创建区域连接...")
        
        # 连接大城市之间
        if len(major_cities) > 1:
            for i in range(len(major_cities)):
                for j in range(i + 1, len(major_cities)):
                    if random.random() < 0.4:  # 40%概率连接
                        city1 = major_cities[i]
                        city2 = major_cities[j]
                        
                        if (city_connections[city1] < city_max_connections[city1] and 
                            city_connections[city2] < city_max_connections[city2]):
                            
                            edge_key = tuple(sorted([city1, city2]))
                            if edge_key not in edge_set:
                                km = random.randint(300, max_km)
                                time = round(km / random.uniform(50, 100), 1)
                                cost = random.randint(100, max_cost)
                                
                                edges.append({
                                    "from": city1,
                                    "to": city2,
                                    "km": km,
                                    "time": time,
                                    "cost": cost
                                })
                                
                                edge_set.add(edge_key)
                                city_connections[city1] += 1
                                city_connections[city2] += 1
        
        # 中等城市连接
        for city in medium_cities:
            # 尝试连接2-4个其他城市
            target_conn = random.randint(2, 4)
            attempts = 0
            
            while city_connections[city] < min(target_conn, city_max_connections[city]) and attempts < 50:
                attempts += 1
                
                # 选择连接对象（优先同等级或更高级城市）
                if random.random() < 0.6 and major_cities:  # 60%概率连接大城市
                    other_city = random.choice(major_cities)
                elif random.random() < 0.8:  # 20%概率连接中等城市
                    other_city = random.choice([c for c in medium_cities if c != city])
                else:  # 20%概率连接小城市
                    other_city = random.choice(small_cities) if small_cities else random.choice(cities)
                
                if city == other_city:
                    continue
                    
                if (city_connections[city] < city_max_connections[city] and 
                    city_connections[other_city] < city_max_connections[other_city]):
                    
                    edge_key = tuple(sorted([city, other_city]))
                    if edge_key not in edge_set:
                        # 确定距离
                        level1 = city_levels[city]
                        level2 = city_levels[other_city]
                        
                        if level1 == 3 or level2 == 3:
                            km = random.randint(200, 1000)
                        elif level1 == 2 and level2 == 2:
                            km = random.randint(100, 600)
                        else:
                            km = random.randint(50, 300)
                        
                        time = round(km / random.uniform(40, 70), 1)
                        cost = random.randint(20, int(km * 0.6))
                        
                        edges.append({
                            "from": city,
                            "to": other_city,
                            "km": km,
                            "time": time,
                            "cost": cost
                        })
                        
                        edge_set.add(edge_key)
                        city_connections[city] += 1
                        city_connections[other_city] += 1
        
        # 小城市连接
        for city in small_cities:
            # 尝试连接1-3个其他城市
            target_conn = random.randint(1, 3)
            attempts = 0
            
            while city_connections[city] < min(target_conn, city_max_connections[city]) and attempts < 30:
                attempts += 1
                
                # 优先连接中等或大城市
                if random.random() < 0.7 and (medium_cities or major_cities):  # 70%概率连接更高级城市
                    candidates = medium_cities + major_cities
                    other_city = random.choice(candidates)
                else:  # 30%概率连接小城市
                    other_city = random.choice([c for c in small_cities if c != city])
                
                if city == other_city:
                    continue
                    
                if (city_connections[city] < city_max_connections[city] and 
                    city_connections[other_city] < city_max_connections[other_city]):
                    
                    edge_key = tuple(sorted([city, other_city]))
                    if edge_key not in edge_set:
                        km = random.randint(30, 200)
                        time = round(km / random.uniform(30, 60), 1)
                        cost = random.randint(15, int(km * 0.8))
                        
                        edges.append({
                            "from": city,
                            "to": other_city,
                            "km": km,
                            "time": time,
                            "cost": cost
                        })
                        
                        edge_set.add(edge_key)
                        city_connections[city] += 1
                        city_connections[other_city] += 1
        
        # 第三阶段：添加随机连接直到达到目标边数
        print(f"已创建 {len(edges)} 条线路，继续添加随机连接...")
        
        max_attempts = min(5000, num_cities * 20)
        attempts = 0
        added_in_phase = 0
        
        while len(edges) < target_edges and attempts < max_attempts:
            city1 = random.choice(cities)
            city2 = random.choice(cities)
            
            if city1 == city2:
                attempts += 1
                continue
            
            # 检查连接数上限
            if (city_connections[city1] >= city_max_connections[city1] or 
                city_connections[city2] >= city_max_connections[city2]):
                attempts += 1
                continue
            
            edge_key = tuple(sorted([city1, city2]))
            if edge_key not in edge_set:
                # 根据城市等级确定参数
                level1 = city_levels[city1]
                level2 = city_levels[city2]
                
                max_km_for_edge = max_km
                if level1 == 1 and level2 == 1:
                    max_km_for_edge = 300
                elif level1 == 1 or level2 == 1:
                    max_km_for_edge = 600
                
                km = random.randint(50, max_km_for_edge)
                time = round(km / random.uniform(40, 70), 1)
                cost = random.randint(30, int(km * 0.5))
                
                edges.append({
                    "from": city1,
                    "to": city2,
                    "km": km,
                    "time": time,
                    "cost": cost
                })
                
                edge_set.add(edge_key)
                city_connections[city1] += 1
                city_connections[city2] += 1
                added_in_phase += 1
            
            attempts += 1
        
        if added_in_phase > 0:
            print(f"第三阶段添加了 {added_in_phase} 条随机连接")
        
        print(f"最终边数：{len(edges)}")
        
        # 检查网络连通性
        adj = {city: set() for city in cities}
        for edge in edges:
            adj[edge["from"]].add(edge["to"])
            adj[edge["to"]].add(edge["from"])
        
        visited = set()
        components = []
        
        for city in cities:
            if city not in visited:
                component = []
                stack = [city]
                
                while stack:
                    current = stack.pop()
                    if current not in visited:
                        visited.add(current)
                        component.append(current)
                        stack.extend(adj[current])
                
                if component:
                    components.append(component)
        
        print(f"网络连通分量：{len(components)} 个")
        
        # 创建数据字典
        data = {
            "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "world_name": "艾泽拉斯大陆（优化版）",
            "description": "优化的奇幻世界铁路网络，连接数更合理",
            "total_cities": len(cities),
            "total_edges": len(edges),
            "generation_info": {
                "edge_multiplier": edge_multiplier,
                "max_distance_km": max_km,
                "max_time_hours": max_time,
                "max_cost": max_cost,
                "city_levels": {
                    "major_cities": len(major_cities),
                    "medium_cities": len(medium_cities),
                    "small_cities": len(small_cities)
                },
                "connectivity": {
                    "components": len(components),
                    "largest_component": max(len(c) for c in components) if components else 0
                }
            }
        }
        
        # 添加连接数统计（避免除零错误）
        connection_stats = {
            "max_connections": max(city_connections.values()),
            "min_connections": min(city_connections.values()),
            "avg_connections": round(sum(city_connections.values()) / len(cities), 2)
        }
        
        # 按城市等级统计
        if major_cities:
            major_avg = round(sum(city_connections[c] for c in major_cities) / len(major_cities), 2)
            connection_stats["major_city_avg"] = major_avg
        else:
            connection_stats["major_city_avg"] = 0
            
        if medium_cities:
            medium_avg = round(sum(city_connections[c] for c in medium_cities) / len(medium_cities), 2)
            connection_stats["medium_city_avg"] = medium_avg
        else:
            connection_stats["medium_city_avg"] = 0
            
        if small_cities:
            small_avg = round(sum(city_connections[c] for c in small_cities) / len(small_cities), 2)
            connection_stats["small_city_avg"] = small_avg
        else:
            connection_stats["small_city_avg"] = 0
        
        data["connection_stats"] = connection_stats
        data["places"] = cities
        data["edges"] = edges
        
        return data

def analyze_network(data: Dict):
    """分析网络连接性"""
    cities = data["places"]
    edges = data["edges"]
    
    # 构建邻接表
    adj = {city: set() for city in cities}
    for edge in edges:
        adj[edge["from"]].add(edge["to"])
        adj[edge["to"]].add(edge["from"])
    
    # 计算连通分量
    visited = set()
    components = []
    
    for city in cities:
        if city not in visited:
            # BFS找到连通分量
            component = []
            queue = [city]
            
            while queue:
                current = queue.pop(0)
                if current not in visited:
                    visited.add(current)
                    component.append(current)
                    queue.extend(adj[current])
            
            if component:
                components.append(component)
    
    # 计算连接数统计
    connection_counts = {city: len(adj[city]) for city in cities}
    
    analysis = {
        "total_components": len(components),
        "largest_component": max(len(c) for c in components) if components else 0,
        "isolated_cities": sum(1 for c in components if len(c) == 1),
        "max_connections": max(connection_counts.values()),
        "min_connections": min(connection_counts.values()),
        "avg_connections": round(sum(connection_counts.values()) / len(cities), 2)
    }
    
    return analysis

def main():
    """主函数"""
    print("=" * 60)
    print("修复版艾泽拉斯大陆铁路网络生成器")
    print("=" * 60)
    
    generator = RailwayGenerator()
    
    # 生成三个版本
    versions = [
        ("小型测试网络", 30, 1.3, 800, 24.0, 500),
        ("中型网络", 80, 1.5, 1200, 36.0, 800),
        ("大型网络", 150, 1.8, 2000, 48.0, 1000)
    ]
    
    for version_name, num_cities, edge_multiplier, max_km, max_time, max_cost in versions:
        print(f"\n生成{version_name}...")
        print("-" * 40)
        
        try:
            data = generator.generate_railway_data(
                num_cities=num_cities,
                edge_multiplier=edge_multiplier,
                max_km=max_km,
                max_time=max_time,
                max_cost=max_cost
            )
            
            # 分析网络
            analysis = analyze_network(data)
            
            print(f"\n{version_name}分析结果:")
            print(f"城市总数: {data['total_cities']}")
            print(f"铁路线路总数: {data['total_edges']}")
            print(f"连通分量数量: {analysis['total_components']}")
            print(f"最大连通分量大小: {analysis['largest_component']}")
            print(f"孤立城市数量: {analysis['isolated_cities']}")
            print(f"每个城市平均连接数: {analysis['avg_connections']}")
            print(f"最大连接数: {analysis['max_connections']}")
            print(f"最小连接数: {analysis['min_connections']}")
            
            # 显示连接数统计
            if 'connection_stats' in data:
                print(f"\n连接数统计:")
                print(f"大城市平均连接数: {data['connection_stats']['major_city_avg']}")
                print(f"中等城市平均连接数: {data['connection_stats']['medium_city_avg']}")
                print(f"小城市平均连接数: {data['connection_stats']['small_city_avg']}")
            
            # 保存到文件
            safe_name = version_name.replace(" ", "_").replace("网络", "")
            filename = f"azeroth_{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            print(f"\n数据已保存到: {filename}")
            print(f"文件大小: {len(json.dumps(data, ensure_ascii=False).encode('utf-8')) / 1024:.2f} KB")
            
        except Exception as e:
            print(f"生成{version_name}时出错: {e}")
            import traceback
            traceback.print_exc()
    
    print("=" * 60)
    print("所有网络生成完成！")
    print("使用说明:")
    print("1. 在铁路查询系统中点击'导入JSON数据'")
    print("2. 选择生成的JSON文件")
    print("3. 系统将加载这个优化的铁路网络")
    print("\n建议使用小型或中型网络进行测试，大型网络渲染可能需要优化")
    print("=" * 60)

if __name__ == "__main__":
    main()