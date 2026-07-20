import matplotlib.pyplot as plt
import networkx as nx
from sympy.combinatorics.named_groups import SymmetricGroup, AlternatingGroup, DihedralGroup
from sympy.combinatorics import PermutationGroup

def is_prime(n):
    """简单的素数判断（用于显示）"""
    if n < 2:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

def visualize_normal_series(group, series_type='composition'):
    """
    可视化群的正规子群链

    参数:
        group: SymPy PermutationGroup 对象
        series_type: 'composition' (合成列) 或 'derived' (导出列/导群列)
    """
    # 尝试计算合成列，若群不可解则自动回退到导出列
    if series_type == 'composition':
        try:
            series = group.composition_series()
            title = f"Composition Series of {group.generators[0].cyclic_form[0]}... (Order: {group.order()})"
        except NotImplementedError:
            print("\n⚠️  Warning: The group is not solvable, so composition_series() is not available.")
            print("   Switching to derived_series() for demonstration.\n")
            series = group.derived_series()
            series_type = 'derived'  # 实际改为导出列
            title = f"Derived Series of {group} (Order: {group.order()}) [Not solvable]"
    else:
        series = group.derived_series()
        title = f"Derived Series of {group} (Order: {group.order()})"

    # 创建有向图
    G = nx.DiGraph()
    labels = {}

    for i, subgroup in enumerate(series):
        order = int(subgroup.order())
        if i == 0:
            label = f"G₀ = G\n|G₀| = {order}"
        elif i == len(series) - 1:
            label = f"G_{i} = {{e}}\n|G_{i}| = 1"
        else:
            prev_order = int(series[i-1].order())
            quotient_order = prev_order // order if order > 0 else prev_order
            # 对于合成列，子商是单群；对于导出列，子商是交换群
            if series_type == 'composition':
                extra = f"prime={is_prime(quotient_order)}" if quotient_order > 1 else "trivial"
            else:
                extra = "abelian"  # 导出列的子商总是交换群
            label = f"G_{i}\n|G_{i}|={order}\n[G_{i-1}:G_{i}]={quotient_order}\n({extra})"
        G.add_node(i)
        labels[i] = label
        if i > 0:
            G.add_edge(i-1, i)

    # 绘制图形
    plt.figure(figsize=(12, 8))
    # 使用层次布局使链条更清晰
    pos = {i: (0, -i) for i in range(len(series))}
    nx.draw_networkx_nodes(G, pos, node_color='lightblue',
                          node_size=3000, node_shape='s')
    nx.draw_networkx_edges(G, pos, edge_color='gray',
                          arrows=True, arrowsize=20,
                          connectionstyle="arc3,rad=0.1")
    nx.draw_networkx_labels(G, pos, labels, font_size=9, font_weight='bold')
    edge_labels = {(i-1, i): "⊳" for i in range(1, len(series))}
    nx.draw_networkx_edge_labels(G, pos, edge_labels, font_size=14)
    plt.title(title, fontsize=14, fontweight='bold')
    plt.axis('off')
    plt.tight_layout()
    plt.show()

    # 打印详细信息表格
    print(f"\n{'='*70}")
    print(f"群列分析 (Group Series Analysis) - {series_type}")
    print(f"{'='*70}")
    print(f"群 G: {series[0].generators[0].cyclic_form if series[0].generators else 'Trivial'} ...")
    print(f"|G| = {int(series[0].order())}")
    print(f"\n{'Index':<6} {'Subgroup Order':<15} {'Factor Group Order':<18} {'Note'}")
    print(f"{'-'*70}")

    for i, subgroup in enumerate(series):
        order = int(subgroup.order())
        if i == 0:
            print(f"G_{i:<3} {order:<15} {'N/A':<18} {'starting group'}")
        else:
            prev_order = int(series[i-1].order())
            factor_order = prev_order // order if order > 0 else prev_order
            if series_type == 'composition':
                note = f"single group, order {factor_order}"
                if factor_order > 1 and is_prime(factor_order):
                    note += " (prime, thus cyclic & abelian)"
            else:
                note = "abelian quotient (derived series)"
            print(f"G_{i:<3} {order:<15} {factor_order:<18} {note}")

    # 判断可解性（通过导出列是否终止于平凡群）
    derived_series = group.derived_series()
    is_solvable = len(derived_series) > 0 and derived_series[-1].is_trivial
    print(f"\n{'='*70}")
    print(f"是否为可解群? {'✅ 是 (Solvable)' if is_solvable else '❌ 否 (Not Solvable)'}")
    print(f"导出列长度: {len(derived_series)-1} (达到平凡群所需的正规化次数)")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    # 示例 1: 对称群 S4（可解群）
    print("\n" + "🔷" * 30)
    print("示例 1: 对称群 S4 (Symmetric Group of degree 4)")
    S4 = SymmetricGroup(4)
    visualize_normal_series(S4, series_type='composition')

    # 示例 2: 交错群 A4（可解群）
    print("\n" + "🔷" * 30)
    print("示例 2: 交错群 A4 (Alternating Group of degree 4)")
    A4 = AlternatingGroup(4)
    visualize_normal_series(A4, series_type='composition')

    # 示例 3: 二面体群 D6（可解群）
    print("\n" + "🔷" * 30)
    print("示例 3: 二面体群 D6 (Dihedral Group of order 12)")
    D6 = DihedralGroup(6)
    visualize_normal_series(D6, series_type='composition')

    # 示例 4: 对称群 S5（不可解群） -> 自动切换为导出列
    print("\n" + "🔷" * 30)
    print("示例 4: 对称群 S5 (Symmetric Group of degree 5)")
    S5 = SymmetricGroup(5)
    visualize_normal_series(S5, series_type='composition')

    # 示例 5: 可选：强制使用导出列对比
    print("\n" + "🔷" * 30)
    print("示例 5: S4 的导出列 (Derived Series)")
    visualize_normal_series(S4, series_type='derived')