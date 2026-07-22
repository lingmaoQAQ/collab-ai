from graph import place,railway_transportion_sys

def main():
    sys = railway_transportion_sys()
    city = ["北京","西安","郑州","徐州","成都","广州","上海"]
    sys.add_places(*city)
    route = [
            ("北京","西安",2553,8,885),
            ("北京","郑州",695,2.3,202),
            ("北京","徐州",704,2.5,225),
            ("西安","郑州",511,1.5,148),
            ("郑州","徐州",349,1.2,112),
            ("西安","成都",812,3,283),
            ("郑州","广州",1579,5,495),
            ("徐州","上海",651,2,162),
            ("成都","广州",2368,7,684),
            ("广州","上海",1385,4,386),
    ]

    batch_add_res = sys.batch_add_edges(route)
    sys._print_graph()

    if batch_add_res[0]:
        print("所有边添加成功")
    else:
        print("以下边添加失败：")
        for k,v in batch_add_res[1].items():
            print(f"{k}:{v}")

    # 查询最短距离
    res = sys.query_path("北京","上海",'km')
    if res[0]:
        print(f"最短距离为：{res[1]}，路径为：{[p.name for p in res[2]]}")
    else:
        print(res[1])
        
    # 查询最短时间
    res = sys.query_path("北京","上海",'time')
    if res[0]:
        print(f"最短时间为：{res[1]}，路径为：{[p.name for p in res[2]]}")
    else:
        print(res[1])
        
    # 查询最低成本
    res = sys.query_path("北京","上海",'cost')
    if res[0]:
        print(f"最低成本为：{res[1]}，路径为：{[p.name for p in res[2]]}")
    else:
        print(res[1])

    # 查询最少中转次数
    res = sys.query_path("北京","上海",'transit')
    if res[0]:
        print(f"最少中转次数为：{res[1]}，路径为：{[p.name for p in res[2]]}")
    else:
        print(res[1])

if __name__ == "__main__":
    main()