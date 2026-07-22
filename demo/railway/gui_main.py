# gui_main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
from datetime import datetime
import os
import uvicorn


# 导入原有的图结构
from graph import railway_transportion_sys

app = FastAPI(title="铁路交通查询系统", description="课程设计作业 - 铁路交通查询系统")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化铁路交通系统
railway_sys = railway_transportion_sys()

# 数据模型定义
class PathQuery(BaseModel):
    start: str
    end: str
    metric: str

class PlaceAddRequest(BaseModel):
    places: List[str]

class EdgeAddRequest(BaseModel):
    edges: List[Dict[str, Any]]

class EdgeRemoveRequest(BaseModel):
    p1: str
    p2: str

class EdgeModifyRequest(BaseModel):
    p1: str
    p2: str
    km: Optional[int] = None
    time: Optional[float] = None
    cost: Optional[int] = None

# 初始化系统数据
def initialize_system():
    """从JSON文件加载数据，如果文件存在则从文件加载，否则使用默认数据"""
    json_file_path = "railway_data.json"
    
    try:
        # 检查JSON文件是否存在
        if os.path.exists(json_file_path):
            print(f"正在从文件加载数据: {json_file_path}")
            with open(json_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 清空现有数据
            railway_sys.V = []
            
            # 添加城市
            if "places" in data and data["places"]:
                success, message = railway_sys.add_places(*data["places"])
                if not success:
                    print(f"添加城市时遇到问题: {message}")
            
            # 添加线路
            if "edges" in data and data["edges"]:
                edges_list = []
                for edge in data["edges"]:
                    edges_list.append((
                        edge["from"],
                        edge["to"],
                        edge["km"],
                        edge["time"],
                        edge["cost"]
                    ))
                
                success, fail_dict = railway_sys.batch_add_edges(edges_list)
                if not success:
                    print(f"添加线路时遇到问题: {fail_dict}")
            
            print(f"成功从JSON文件加载数据: {len(data.get('places', []))} 个城市, {len(data.get('edges', []))} 条线路")
        else:
            # 如果JSON文件不存在，使用默认数据
            print("未找到JSON数据文件，使用默认数据初始化...")
            use_default_data()
            
    except Exception as e:
        print(f"加载JSON文件失败: {e}")
        use_default_data()

def use_default_data():
    """默认初始化"""
    city = ["北京","西安","郑州","徐州","成都","广州","上海"]
    railway_sys.add_places(*city)
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

    railway_sys.batch_add_edges(route)
    pass

# HTML 页面（内嵌Vue.js前端和vis-network可视化）
HTML_PAGE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>铁路交通查询系统 - 课程设计作业</title>
    <script src="https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.2/dist/axios.min.js"></script>
    <!-- vis-network 库 -->
    <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            background-color: #f8f9fa;
            padding-top: 20px;
            padding-bottom: 50px;
        }
        .container {
            max-width: 1400px;
        }
        .card {
            margin-bottom: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .card-header {
            background-color: #0d6efd;
            color: white;
            border-radius: 10px 10px 0 0 !important;
        }
        .result-box {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            border-left: 4px solid #0d6efd;
        }
        .path-item {
            display: inline-block;
            padding: 5px 10px;
            margin: 2px;
            background-color: #e9ecef;
            border-radius: 5px;
        }
        .path-arrow {
            margin: 0 5px;
            color: #0d6efd;
        }
        .metric-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #0d6efd;
        }
        #network {
            width: 100%;
            height: 500px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: white;
        }
        .network-container {
            position: relative;
        }
        .network-controls {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 100;
            background-color: rgba(255, 255, 255, 0.9);
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .btn-group-vertical {
            gap: 5px;
        }
        .btn-sm {
            padding: 3px 8px;
            font-size: 12px;
        }
        .highlight-path {
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { stroke-width: 2px; }
            50% { stroke-width: 5px; }
            100% { stroke-width: 2px; }
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            margin-right: 8px;
            border-radius: 50%;
        }
        .legend-text {
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div id="app" class="container">
        <div class="text-center mb-4">
            <h1 class="display-4">🚄 铁路交通查询系统</h1>
            <p class="lead">课程设计作业 - 查询最短距离、最短时间、最低费用、最少中转</p>
        </div>

        <!-- 系统信息 -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card text-white bg-primary">
                    <div class="card-body text-center">
                        <h5 class="card-title">城市数量</h5>
                        <h2>{{ systemInfo.total_places || 0 }}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-white bg-success">
                    <div class="card-body text-center">
                        <h5 class="card-title">线路数量</h5>
                        <h2>{{ systemInfo.total_edges || 0 }}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">支持查询类型</h5>
                        <div class="d-flex flex-wrap">
                            <span v-for="metric in systemInfo.supported_metrics" 
                                  class="badge bg-info me-2 mb-2 p-2">
                                {{ metric.label }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 路径查询 -->
        <div class="card">
            <div class="card-header">
                <h4>🔍 路径查询</h4>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-3">
                        <label class="form-label">起点城市</label>
                        <select v-model="query.start" class="form-select" @change="highlightNode(query.start)">
                            <option value="">请选择起点</option>
                            <option v-for="place in places" :value="place">{{ place }}</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">终点城市</label>
                        <select v-model="query.end" class="form-select" @change="highlightNode(query.end)">
                            <option value="">请选择终点</option>
                            <option v-for="place in places" :value="place">{{ place }}</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">查询类型</label>
                        <select v-model="query.metric" class="form-select">
                            <option value="km">最短距离</option>
                            <option value="time">最短时间</option>
                            <option value="cost">最低费用</option>
                            <option value="transit">最少中转</option>
                        </select>
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                        <button @click="doQuery" class="btn btn-primary w-100" 
                                :disabled="!query.start || !query.end">
                            查询路径
                        </button>
                    </div>
                </div>

                <!-- 查询结果 -->
                <div v-if="queryResult" class="result-box mt-4">
                    <div v-if="queryResult.success">
                        <h5>查询结果：{{ query.start }} → {{ query.end }}</h5>
                        <div class="row mt-3">
                            <div class="col-md-4">
                                <div class="text-center">
                                    <div class="text-muted">最优{{ queryResult.metric }}</div>
                                    <div class="metric-value">
                                        {{ queryResult.value }}
                                        <span v-if="query.metric === 'km'">公里</span>
                                        <span v-if="query.metric === 'time'">小时</span>
                                        <span v-if="query.metric === 'cost'">元</span>
                                        <span v-if="query.metric === 'transit'">次</span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <div class="text-muted mb-2">路径详情：</div>
                                <div>
                                    <span v-for="(city, index) in queryResult.path" class="path-item">
                                        {{ city }}
                                        <span v-if="index < queryResult.path.length - 1" class="path-arrow">→</span>
                                    </span>
                                </div>
                                <button v-if="queryResult.path.length > 1" @click="highlightPath(queryResult.path)" 
                                        class="btn btn-sm btn-outline-primary mt-2">
                                    🗺️ 在地图上高亮显示此路径
                                </button>
                            </div>
                        </div>
                    </div>
                    <div v-else class="alert alert-warning">
                        {{ queryResult.message }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 铁路网络图 -->
        <div class="card mt-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5>🗺️ 铁路网络图</h5>
                <div class="legend d-flex">
                    <div class="legend-item me-3">
                        <div class="legend-color" style="background-color: #0d6efd;"></div>
                        <div class="legend-text">普通车站</div>
                    </div>
                    <div class="legend-item me-3">
                        <div class="legend-color" style="background-color: #dc3545;"></div>
                        <div class="legend-text">选中车站</div>
                    </div>
                    <div class="legend-item me-3">
                        <div class="legend-color" style="background-color: #28a745;"></div>
                        <div class="legend-text">最短路径</div>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background-color: #ffc107; border: 1px solid #d39e00;"></div>
                        <div class="legend-text">起点/终点</div>
                    </div>
                </div>
            </div>
            <div class="card-body network-container">
                <div id="network"></div>
                <div class="network-controls">
                    <div class="btn-group-vertical">
                        <button @click="zoomIn" class="btn btn-sm btn-outline-secondary">
                            <i>+</i> 放大
                        </button>
                        <button @click="zoomOut" class="btn btn-sm btn-outline-secondary">
                            <i>-</i> 缩小
                        </button>
                        <button @click="fitNetwork" class="btn btn-sm btn-outline-secondary">
                            <i>🗖</i> 适应视图
                        </button>
                        <button @click="resetView" class="btn btn-sm btn-outline-secondary">
                            <i>↺</i> 重置视图
                        </button>
                        <button @click="togglePhysics" class="btn btn-sm btn-outline-secondary">
                            <span v-if="physicsEnabled">⏸️ 停止布局</span>
                            <span v-else">▶️ 开始布局</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 操作区域 -->
        <div class="row mt-4">
            <!-- 添加城市 -->
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>🏙️ 添加城市</h5>
                    </div>
                    <div class="card-body">
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" v-model="newPlace" 
                                   placeholder="输入城市名称（多个用逗号分隔）">
                            <button class="btn btn-primary" @click="addPlace">添加</button>
                        </div>
                        <small class="text-muted">例如：天津,沈阳,哈尔滨</small>
                    </div>
                </div>
            </div>

            <!-- 添加线路 -->
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>🛤️ 添加线路</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-2">
                            <div class="col-md-6">
                                <select v-model="newEdge.from" class="form-select form-select-sm">
                                    <option value="">起点</option>
                                    <option v-for="place in places" :value="place">{{ place }}</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <select v-model="newEdge.to" class="form-select form-select-sm">
                                    <option value="">终点</option>
                                    <option v-for="place in places" :value="place">{{ place }}</option>
                                </select>
                            </div>
                        </div>
                        <div class="row g-2 mb-2">
                            <div class="col-md-4">
                                <input type="number" v-model="newEdge.km" class="form-control form-control-sm" placeholder="距离(km)">
                            </div>
                            <div class="col-md-4">
                                <input type="number" step="0.1" v-model="newEdge.time" class="form-control form-control-sm" placeholder="时间(小时)">
                            </div>
                            <div class="col-md-4">
                                <input type="number" v-model="newEdge.cost" class="form-control form-control-sm" placeholder="费用(元)">
                            </div>
                        </div>
                        <button class="btn btn-primary btn-sm w-100" @click="addEdge" 
                                :disabled="!newEdge.from || !newEdge.to">
                            添加线路
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 数据管理 -->
        <div class="card mt-4">
            <div class="card-header">
                <h5>💾 数据管理</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6 mb-2">
                        <button class="btn btn-outline-primary w-100" @click="exportData">
                            📥 导出数据为JSON
                        </button>
                    </div>
                    <div class="col-md-6">
                        <div class="input-group">
                            <input type="file" class="form-control" id="importFile" 
                                   accept=".json" @change="handleFileUpload">
                            <button class="btn btn-outline-success" @click="importData">
                                📤 导入JSON数据
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 数据表格 -->
        <div class="row mt-4">
            <!-- 城市列表 -->
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>🏙️ 城市列表</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>城市名称</th>
                                        <th>连接线路数</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(place, index) in places" :key="place">
                                        <td>{{ index + 1 }}</td>
                                        <td>{{ place }}</td>
                                        <td>
                                            <span class="badge bg-secondary">
                                                {{ getPlaceConnections(place) }}
                                            </span>
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-info" @click="highlightNode(place)">
                                                在地图显示
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 线路列表 -->
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5>🛤️ 线路列表</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>起点</th>
                                        <th>终点</th>
                                        <th>距离(km)</th>
                                        <th>时间(小时)</th>
                                        <th>费用(元)</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(edge, index) in edges" :key="index">
                                        <td>{{ edge.from }}</td>
                                        <td>{{ edge.to }}</td>
                                        <td>{{ edge.km }}</td>
                                        <td>{{ edge.time }}</td>
                                        <td>{{ edge.cost }}</td>
                                        <td>
                                            <button class="btn btn-sm btn-danger me-1" 
                                                    @click="removeEdge(edge.from, edge.to)">
                                                删除
                                            </button>
                                            <button class="btn btn-sm btn-info" 
                                                    @click="highlightEdge(edge.from, edge.to)">
                                                在地图显示
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 底部信息 -->
        <footer class="mt-5 text-center text-muted">
            <p>铁路交通查询系统 - 课程设计作业</p>
            <p>使用FastAPI + Vue.js + vis-network实现</p>
            <p>网络图支持：拖拽旋转、滚轮缩放、点击选中</p>
        </footer>
    </div>

    <script>
        const { createApp, ref, onMounted, watch } = Vue;

        createApp({
            setup() {
                const places = ref([]);
                const edges = ref([]);
                const systemInfo = ref({});
                const query = ref({
                    start: '',
                    end: '',
                    metric: 'km'
                });
                const queryResult = ref(null);
                const newPlace = ref('');
                const newEdge = ref({
                    from: '',
                    to: '',
                    km: '',
                    time: '',
                    cost: ''
                });
                const network = ref(null);
                const physicsEnabled = ref(true);
                const highlightedPath = ref([]);
                const selectedNodes = ref([]);

                // 初始化数据
                const initData = async () => {
                    try {
                        const placesRes = await axios.get('/api/places');
                        places.value = placesRes.data.places;
                        
                        const edgesRes = await axios.get('/api/edges');
                        edges.value = edgesRes.data.edges;
                        
                        const infoRes = await axios.get('/api/system_info');
                        systemInfo.value = infoRes.data;
                        
                        // 初始化网络图
                        initNetwork();
                    } catch (error) {
                        console.error('初始化数据失败:', error);
                        alert('初始化数据失败，请检查后端服务是否启动');
                    }
                };

                // 初始化网络图
                const initNetwork = () => {
                    const container = document.getElementById('network');
                    
                    // 创建节点数据
                    const nodes = new vis.DataSet(
                        places.value.map((place, index) => ({
                            id: place,
                            label: place,
                            title: `${place} (连接数: ${getPlaceConnections(place)})`,
                            color: {
                                background: '#0d6efd',
                                border: '#0a58ca',
                                highlight: {
                                    background: '#dc3545',
                                    border: '#b02a37'
                                }
                            },
                            shape: 'dot',
                            size: 20 + getPlaceConnections(place) * 2, // 根据连接数调整大小
                            font: {
                                size: 16,
                                color: '#333',
                                strokeWidth: 2,
                                strokeColor: 'white'
                            }
                        }))
                    );
                    
                    // 创建边数据
                    const edgesData = edges.value.map((edge, index) => ({
                        id: `${edge.from}-${edge.to}`,
                        from: edge.from,
                        to: edge.to,
                        label: `${edge.km}km/${edge.time}h/${edge.cost}元`,
                        title: `距离: ${edge.km}km\n时间: ${edge.time}小时\n费用: ${edge.cost}元`,
                        color: {
                            color: '#6c757d',
                            highlight: '#28a745',
                            hover: '#28a745'
                        },
                        width: 2,
                        smooth: {
                            type: 'continuous',
                            roundness: 0.1
                        },
                        arrows: {
                            to: { enabled: false },
                            from: { enabled: false }
                        },
                        font: {
                            size: 12,
                            align: 'top',
                            strokeWidth: 2,
                            strokeColor: 'white'
                        }
                    }));
                    
                    const edgesSet = new vis.DataSet(edgesData);
                    
                    // 网络图配置
                    const options = {
                        nodes: {
                            shape: 'dot',
                            size: 20,
                            font: {
                                size: 16,
                                color: '#333',
                                strokeWidth: 2,
                                strokeColor: 'white'
                            },
                            borderWidth: 2,
                            shadow: true
                        },
                        edges: {
                            width: 2,
                            color: {
                                color: '#6c757d',
                                highlight: '#28a745',
                                hover: '#28a745'
                            },
                            smooth: {
                                type: 'continuous',
                                roundness: 0.1
                            },
                            font: {
                                size: 12,
                                align: 'top',
                                strokeWidth: 2,
                                strokeColor: 'white'
                            },
                            arrows: {
                                to: { enabled: false },
                                from: { enabled: false }
                            }
                        },
                        physics: {
                            enabled: physicsEnabled.value,
                            solver: 'forceAtlas2Based',
                            forceAtlas2Based: {
                                gravitationalConstant: -100,
                                centralGravity: 0.01,
                                springLength: 200,
                                springConstant: 0.12,
                                damping: 0.4,
                                avoidOverlap: 1,
                                barnesHut: {
                                    avoidOverlap: 0
                                }
                            },
                            stabilization: {
                                enabled: true,
                                iterations: 1000,
                                updateInterval: 100
                            }
                        },
                        interaction: {
                            dragNodes: true,
                            dragView: true,
                            zoomView: true,
                            hover: true,
                            hoverConnectedEdges: true,
                            selectable: true,
                            selectConnectedEdges: true,
                            navigationButtons: true,
                            keyboard: {
                                enabled: true,
                                speed: { x: 10, y: 10, zoom: 0.02 }
                            },
                            tooltipDelay: 200,
                            multiselect: true
                        },
                        manipulation: {
                            enabled: false
                        }
                    };
                    
                    // 创建网络图
                    const data = { nodes, edges: edgesSet };
                    network.value = new vis.Network(container, data, options);
                    
                    // 添加事件监听
                    network.value.on('click', function(params) {
                        if (params.nodes.length > 0) {
                            const nodeId = params.nodes[0];
                            selectedNodes.value = params.nodes;
                            highlightNode(nodeId);
                            
                            // 自动选择查询起点/终点
                            if (!query.value.start) {
                                query.value.start = nodeId;
                            } else if (!query.value.end) {
                                query.value.end = nodeId;
                            }
                        }
                        
                        if (params.edges.length > 0) {
                            const edgeId = params.edges[0];
                            const edge = edges.value.find(e => 
                                `${e.from}-${e.to}` === edgeId || `${e.to}-${e.from}` === edgeId
                            );
                            if (edge) {
                                highlightEdge(edge.from, edge.to);
                            }
                        }
                    });
                    
                    // 双击事件
                    network.value.on('doubleClick', function(params) {
                        if (params.nodes.length > 0) {
                            const nodeId = params.nodes[0];
                            network.value.focus(nodeId, {
                                scale: 1.2,
                                animation: {
                                    duration: 1000,
                                    easingFunction: 'easeInOutQuad'
                                }
                            });
                        }
                    });
                };

                // 高亮节点
                const highlightNode = (nodeId) => {
                    if (!network.value || !nodeId) return;
                    
                    // 先重置所有节点
                    const nodes = network.value.body.data.nodes;
                    nodes.update(
                        nodes.get().map(node => ({
                            ...node,
                            color: {
                                background: '#0d6efd',
                                border: '#0a58ca',
                                highlight: {
                                    background: '#dc3545',
                                    border: '#b02a37'
                                }
                            },
                            size: 20 + getPlaceConnections(node.id) * 2
                        }))
                    );
                    
                    // 高亮选中的节点
                    const node = nodes.get(nodeId);
                    if (node) {
                        nodes.update({
                            id: nodeId,
                            color: {
                                background: '#ffc107',
                                border: '#d39e00',
                                highlight: {
                                    background: '#dc3545',
                                    border: '#b02a37'
                                }
                            },
                            size: 30 + getPlaceConnections(nodeId) * 2,
                            font: {
                                size: 18,
                                color: '#333',
                                strokeWidth: 3,
                                strokeColor: 'white',
                                bold: true
                            }
                        });
                        
                        // 聚焦到该节点
                        network.value.selectNodes([nodeId]);
                        network.value.focus(nodeId, {
                            scale: 1.5,
                            animation: {
                                duration: 1000,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                    }
                };

                // 高亮边
                const highlightEdge = (from, to) => {
                    if (!network.value) return;
                    
                    const edgeId = `${from}-${to}`;
                    const reverseEdgeId = `${to}-${from}`;
                    
                    // 先重置所有边
                    const edges = network.value.body.data.edges;
                    edges.update(
                        edges.get().map(edge => ({
                            ...edge,
                            color: {
                                color: '#6c757d',
                                highlight: '#28a745',
                                hover: '#28a745'
                            },
                            width: 2
                        }))
                    );
                    
                    // 高亮选中的边
                    const edge = edges.get(edgeId) || edges.get(reverseEdgeId);
                    if (edge) {
                        edges.update({
                            id: edge.id,
                            color: {
                                color: '#28a745',
                                highlight: '#20c997',
                                hover: '#20c997'
                            },
                            width: 5,
                            font: {
                                size: 14,
                                color: '#28a745',
                                strokeWidth: 3,
                                strokeColor: 'white',
                                bold: true
                            }
                        });
                        
                        // 同时高亮连接的两个节点
                        highlightNode(from);
                        highlightNode(to);
                    }
                };

                // 高亮路径
                const highlightPath = (path) => {
                    if (!network.value || path.length < 2) return;
                    
                    highlightedPath.value = path;
                    
                    // 先重置所有边和节点
                    const nodes = network.value.body.data.nodes;
                    const edges = network.value.body.data.edges;
                    
                    // 重置节点
                    nodes.update(
                        nodes.get().map(node => ({
                            ...node,
                            color: {
                                background: '#0d6efd',
                                border: '#0a58ca',
                                highlight: {
                                    background: '#dc3545',
                                    border: '#b02a37'
                                }
                            },
                            size: 20 + getPlaceConnections(node.id) * 2,
                            font: {
                                size: 16,
                                color: '#333',
                                strokeWidth: 2,
                                strokeColor: 'white'
                            }
                        }))
                    );
                    
                    // 重置边
                    edges.update(
                        edges.get().map(edge => ({
                            ...edge,
                            color: {
                                color: '#6c757d',
                                highlight: '#28a745',
                                hover: '#28a745'
                            },
                            width: 2,
                            font: {
                                size: 12,
                                color: '#6c757d',
                                strokeWidth: 2,
                                strokeColor: 'white'
                            }
                        }))
                    );
                    
                    // 高亮路径上的节点
                    path.forEach((nodeId, index) => {
                        const node = nodes.get(nodeId);
                        if (node) {
                            const isStartEnd = index === 0 || index === path.length - 1;
                            nodes.update({
                                id: nodeId,
                                color: {
                                    background: isStartEnd ? '#ffc107' : '#28a745',
                                    border: isStartEnd ? '#d39e00' : '#20c997',
                                    highlight: {
                                        background: '#dc3545',
                                        border: '#b02a37'
                                    }
                                },
                                size: isStartEnd ? 35 : 25 + getPlaceConnections(nodeId) * 2,
                                font: {
                                    size: isStartEnd ? 20 : 16,
                                    color: isStartEnd ? '#333' : '#fff',
                                    strokeWidth: 3,
                                    strokeColor: 'white',
                                    bold: true
                                }
                            });
                        }
                    });
                    
                    // 高亮路径上的边
                    for (let i = 0; i < path.length - 1; i++) {
                        const from = path[i];
                        const to = path[i + 1];
                        const edgeId = `${from}-${to}`;
                        const reverseEdgeId = `${to}-${from}`;
                        
                        const edge = edges.get(edgeId) || edges.get(reverseEdgeId);
                        if (edge) {
                            edges.update({
                                id: edge.id,
                                color: {
                                    color: '#28a745',
                                    highlight: '#20c997',
                                    hover: '#20c997'
                                },
                                width: 5,
                                font: {
                                    size: 14,
                                    color: '#28a745',
                                    strokeWidth: 3,
                                    strokeColor: 'white',
                                    bold: true
                                }
                            });
                        }
                    }
                    
                    // 聚焦到整个路径
                    if (path.length > 0) {
                        network.value.fit({
                            nodes: path,
                            animation: {
                                duration: 1500,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                    }
                };

                // 网络图控制函数
                const zoomIn = () => {
                    if (network.value) {
                        const scale = network.value.getScale();
                        network.value.moveTo({
                            scale: scale * 1.2,
                            animation: {
                                duration: 300,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                    }
                };

                const zoomOut = () => {
                    if (network.value) {
                        const scale = network.value.getScale();
                        network.value.moveTo({
                            scale: scale * 0.8,
                            animation: {
                                duration: 300,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                    }
                };

                const fitNetwork = () => {
                    if (network.value) {
                        network.value.fit({
                            animation: {
                                duration: 1000,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                    }
                };

                const resetView = () => {
                    if (network.value) {
                        network.value.fit({
                            animation: {
                                duration: 1000,
                                easingFunction: 'easeInOutQuad'
                            }
                        });
                        // 重置物理引擎
                        network.value.setOptions({ physics: physicsEnabled.value });
                    }
                };

                const togglePhysics = () => {
                    physicsEnabled.value = !physicsEnabled.value;
                    if (network.value) {
                        network.value.setOptions({ physics: physicsEnabled.value });
                    }
                };

                // 查询路径
                const doQuery = async () => {
                    if (!query.value.start || !query.value.end) {
                        alert('请选择起点和终点城市');
                        return;
                    }
                    
                    try {
                        const response = await axios.post('/api/query', query.value);
                        queryResult.value = response.data;
                        
                        // 如果查询成功，高亮显示路径
                        if (queryResult.value.success) {
                            setTimeout(() => {
                                highlightPath(queryResult.value.path);
                            }, 500);
                        }
                    } catch (error) {
                        console.error('查询失败:', error);
                        alert('查询失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 添加城市
                const addPlace = async () => {
                    if (!newPlace.value.trim()) {
                        alert('请输入城市名称');
                        return;
                    }
                    
                    const placeList = newPlace.value.split(',').map(p => p.trim()).filter(p => p);
                    
                    try {
                        const response = await axios.post('/api/places/add', {
                            places: placeList
                        });
                        
                        if (response.data.success) {
                            alert('添加成功');
                            newPlace.value = '';
                            await initData();
                        } else {
                            alert('添加失败: ' + response.data.message);
                        }
                    } catch (error) {
                        alert('添加失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 添加线路
                const addEdge = async () => {
                    if (!newEdge.value.from || !newEdge.value.to) {
                        alert('请选择起点和终点');
                        return;
                    }
                    
                    const edgeData = {
                        from: newEdge.value.from,
                        to: newEdge.value.to,
                        km: parseInt(newEdge.value.km) || 0,
                        time: parseFloat(newEdge.value.time) || 0,
                        cost: parseInt(newEdge.value.cost) || 0
                    };
                    
                    if (edgeData.km <= 0 || edgeData.time <= 0 || edgeData.cost <= 0) {
                        alert('距离、时间和费用必须为正数');
                        return;
                    }
                    
                    try {
                        const response = await axios.post('/api/edges/add', {
                            edges: [edgeData]
                        });
                        
                        if (response.data.success) {
                            alert('添加成功');
                            newEdge.value = { from: '', to: '', km: '', time: '', cost: '' };
                            await initData();
                        } else {
                            alert('添加失败: ' + JSON.stringify(response.data.failed_edges));
                        }
                    } catch (error) {
                        alert('添加失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 删除线路
                const removeEdge = async (from, to) => {
                    if (!confirm(`确定要删除线路 ${from} - ${to} 吗？`)) {
                        return;
                    }
                    
                    try {
                        const response = await axios.delete('/api/edges/remove', {
                            data: { p1: from, p2: to }
                        });
                        
                        if (response.data.success) {
                            alert('删除成功');
                            await initData();
                        } else {
                            alert('删除失败: ' + response.data.message);
                        }
                    } catch (error) {
                        alert('删除失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 导出数据
                const exportData = async () => {
                    try {
                        const response = await axios.get('/api/export');
                        
                        const dataStr = JSON.stringify(response.data, null, 2);
                        const dataBlob = new Blob([dataStr], { type: 'application/json' });
                        const url = window.URL.createObjectURL(dataBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `railway_data_${new Date().toISOString().split('T')[0]}.json`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                        
                        alert('数据导出成功');
                    } catch (error) {
                        alert('导出失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 处理文件上传
                const handleFileUpload = (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            try {
                                const jsonData = JSON.parse(e.target.result);
                                localStorage.setItem('importData', JSON.stringify(jsonData));
                            } catch (error) {
                                alert('文件格式错误，请上传有效的JSON文件');
                            }
                        };
                        reader.readAsText(file);
                    }
                };

                // 导入数据
                const importData = async () => {
                    const jsonStr = localStorage.getItem('importData');
                    if (!jsonStr) {
                        alert('请先选择要导入的JSON文件');
                        return;
                    }
                    
                    if (!confirm('导入数据将覆盖现有数据，确定继续吗？')) {
                        return;
                    }
                    
                    try {
                        const jsonData = JSON.parse(jsonStr);
                        const response = await axios.post('/api/import', jsonData);
                        
                        if (response.data.success) {
                            alert('导入成功');
                            localStorage.removeItem('importData');
                            document.getElementById('importFile').value = '';
                            await initData();
                        } else {
                            alert('导入失败: ' + response.data.message);
                        }
                    } catch (error) {
                        alert('导入失败: ' + error.response?.data?.detail || error.message);
                    }
                };

                // 计算城市的连接线路数
                const getPlaceConnections = (placeName) => {
                    return edges.value.filter(edge => 
                        edge.from === placeName || edge.to === placeName
                    ).length;
                };

                // 监听数据变化，更新网络图
                watch(() => [places.value.length, edges.value.length], () => {
                    if (network.value) {
                        initNetwork();
                    }
                });

                onMounted(() => {
                    initData();
                });

                return {
                    places,
                    edges,
                    systemInfo,
                    query,
                    queryResult,
                    newPlace,
                    newEdge,
                    physicsEnabled,
                    doQuery,
                    addPlace,
                    addEdge,
                    removeEdge,
                    exportData,
                    handleFileUpload,
                    importData,
                    getPlaceConnections,
                    highlightNode,
                    highlightEdge,
                    highlightPath,
                    zoomIn,
                    zoomOut,
                    fitNetwork,
                    resetView,
                    togglePhysics
                };
            }
        }).mount('#app');
    </script>
</body>
</html>
"""

# API路由
@app.get("/", response_class=HTMLResponse)
async def root():
    """返回前端页面"""
    return HTMLResponse(content=HTML_PAGE)

@app.get("/api/places")
async def get_places():
    """获取所有城市"""
    places = [place.name for place in railway_sys.V]
    return {"places": places, "count": len(places)}

@app.get("/api/edges")
async def get_edges():
    """获取所有线路"""
    edges = []
    for place in railway_sys.V:
        for edge in place.edges:
            to_place, km, time, cost = edge
            if not any(e["from"] == to_place.name and e["to"] == place.name for e in edges):
                edges.append({
                    "from": place.name,
                    "to": to_place.name,
                    "km": km,
                    "time": time,
                    "cost": cost
                })
    return {"edges": edges, "count": len(edges)}

@app.post("/api/query")
async def query_path(query: PathQuery):
    """查询路径"""
    try:
        start_place = railway_sys.to_place(query.start)
        end_place = railway_sys.to_place(query.end)
        
        if not start_place:
            raise HTTPException(status_code=404, detail=f"起点城市 '{query.start}' 不存在")
        if not end_place:
            raise HTTPException(status_code=404, detail=f"终点城市 '{query.end}' 不存在")
        
        result = railway_sys.query_path(query.start, query.end, query.metric)
        
        if result[0]:
            metric_name = {
                'km': '距离',
                'time': '时间',
                'cost': '费用',
                'transit': '中转次数'
            }.get(query.metric, query.metric)
            
            return {
                "success": True,
                "metric": metric_name,
                "value": result[1],
                "path": [place.name for place in result[2]],
                "message": f"查询成功: {query.start} -> {query.end}"
            }
        else:
            return {
                "success": False,
                "message": result[1]
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/places/add")
async def add_places(request: PlaceAddRequest):
    """添加城市"""
    try:
        success, message = railway_sys.add_places(*request.places)
        
        if success:
            return {
                "success": True,
                "message": f"成功添加 {len(request.places)} 个城市",
                "added_places": request.places
            }
        else:
            return {
                "success": False,
                "message": message
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/edges/add")
async def add_edges(request: EdgeAddRequest):
    """添加线路"""
    try:
        edges_list = []
        for edge in request.edges:
            edges_list.append((
                edge["from"],
                edge["to"],
                edge["km"],
                edge["time"],
                edge["cost"]
            ))
        
        success, fail_dict = railway_sys.batch_add_edges(edges_list)
        
        if success:
            return {
                "success": True,
                "message": f"成功添加 {len(edges_list)} 条线路",
                "added_edges": request.edges
            }
        else:
            return {
                "success": False,
                "message": "部分线路添加失败",
                "failed_edges": fail_dict
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/edges/remove")
async def remove_edge(request: EdgeRemoveRequest):
    """删除线路"""
    try:
        success, message = railway_sys.remove_edge(request.p1, request.p2)
        
        if success:
            return {
                "success": True,
                "message": f"成功删除线路 {request.p1} - {request.p2}"
            }
        else:
            return {
                "success": False,
                "message": message
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/edges/modify")
async def modify_edge(request: EdgeModifyRequest):
    """修改线路"""
    try:
        success, message = railway_sys.change_edge(
            request.p1, 
            request.p2,
            km=request.km,
            time=request.time,
            cost=request.cost
        )
        
        if success:
            return {
                "success": True,
                "message": f"成功修改线路 {request.p1} - {request.p2}"
            }
        else:
            return {
                "success": False,
                "message": message
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/export")
async def export_data():
    """导出数据为JSON"""
    try:
        places = [place.name for place in railway_sys.V]
        
        edges = []
        for place in railway_sys.V:
            for edge in place.edges:
                to_place, km, time, cost = edge
                if not any(e["from"] == to_place.name and e["to"] == place.name for e in edges):
                    edges.append({
                        "from": place.name,
                        "to": to_place.name,
                        "km": km,
                        "time": time,
                        "cost": cost
                    })
        
        data = {
            "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "places": places,
            "edges": edges
        }
        
        return data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import")
async def import_data(data: Dict[str, Any]):
    """导入JSON数据"""
    try:
        railway_sys.V = []
        
        if "places" in data:
            railway_sys.add_places(*data["places"])
        
        if "edges" in data:
            edges_list = []
            for edge in data["edges"]:
                edges_list.append((
                    edge["from"],
                    edge["to"],
                    edge["km"],
                    edge["time"],
                    edge["cost"]
                ))
            
            railway_sys.batch_add_edges(edges_list)
        
        return {
            "success": True,
            "message": f"成功导入数据: {len(data.get('places', []))} 个城市, {len(data.get('edges', []))} 条线路"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system_info")
async def get_system_info():
    """获取系统信息"""
    return {
        "total_places": len(railway_sys.V),
        "total_edges": sum(len(place.edges) for place in railway_sys.V) // 2,
        "supported_metrics": [
            {"value": "km", "label": "最短距离"},
            {"value": "time", "label": "最短时间"},
            {"value": "cost", "label": "最低费用"},
            {"value": "transit", "label": "最少中转"}
        ]
    }

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化系统"""
    initialize_system()
    print("=" * 60)
    print("🚄 铁路交通查询系统启动中...")
    print("=" * 60)
    print("\n访问地址：http://localhost:8000")
    print("\n系统功能：")
    print("1. 查询最短距离、最短时间、最低费用、最少中转路径")
    print("2. 可视化铁路网络图（支持拖拽旋转、滚轮缩放）")
    print("3. 添加/删除城市和铁路线路")
    print("4. 导入/导出JSON数据")
    print("\n按 Ctrl+C 停止服务")
    print("=" * 60)

def main():
    """启动应用程序"""
    uvicorn.run(app, host="localhost", port=8000)

if __name__ == "__main__":
    main()