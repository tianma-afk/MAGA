"""Construct and freeze the AI-authored 14/10 expansion before candidate runs."""
import hashlib
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    path = root/'docs/fixtures/iteration3-bv2-expansion.json'
    if path.exists():
        raise ValueError('Refuse overwrite')
    fixture = json.loads((root/'docs/fixtures/iteration3-design-needs-v4.json').read_text('utf-8'))
    fixture['topics']['response_capacity']['pages'] = {'chapter-8':[28,29,30]}
    fixture['topics']['response_capacity']['basis'] = '机制口径：增加资源、并发减少阻塞、计算副本降低争用；排除目录20和仅诊断争用16。'
    definitions = [
        ('D01','dev','仓储机器人','调度器要判断搬运车是否掉线','用周期消息检测失联，再由备用控制器保留任务进度接管',['fault_detection','stateful_failover'],'availability'),
        ('D02','dev','短信网关','运营商网络短时断开后通常很快恢复','允许有限次数重发，超过上限明确失败',['bounded_retry'],'availability'),
        ('D03','dev','固件发布','升级后设备出现严重兼容问题','分析回滚到已知良好状态依赖的检查点',['recovery'],'availability'),
        ('D04','dev','地图站点','热门路线数据读取远多于修改','设计缓存并说明多份数据更新的一致性代价',['cache','cache_consistency'],'performance'),
        ('D05','dev','机房通知','断电告警与例行日志同时排队','处理能力不足时先处理断电告警',['event_priority'],'performance'),
        ('D06','dev','视频转码','多份独立视频等待同一台机器处理','分析并发与新增处理资源怎样减少等待',['response_capacity'],'performance'),
        ('D07','dev','酒店分销','供应商房态接口会换版本','通过封装和稳定接口减少业务跟着变化',['interface_isolation'],'modifiability'),
        ('D08','dev','税务规则','同类计税逻辑分散在许多组件','归拢相似职责并限制修改传播',['cohesive_change','limit_change_propagation'],'modifiability'),
        ('D09','dev','跨校选课','两所学校对课程编号和学分字段解释不同','交换后正确理解数据并转换接口',['semantic_interop','interface_translation'],'interoperability'),
        ('D10','dev','志愿者资料','普通志愿者不应读取联系人的隐私数据','讨论授权访问边界及通信保护原则',['security'],'security'),
        ('D11','dev','公共展览导览','观众开放时间应随时可用','解释可用性的停机约束而非仅错误数量',['availability'],'availability'),
        ('D12','dev','遥测看板','采集端要发现失联，看板反复读取同一批历史数据','分别提供心跳检测和缓存更新代价的课程依据',['fault_detection','cache_consistency'],'multi'),
        ('D13','dev','气象计算','重复计算拖慢交互响应','从增加资源和并发减少阻塞讨论性能机制',['response_capacity'],'performance'),
        ('D14','dev','新密码设计','自行发明不可破解的加密算法','请给出严格数学证明和密钥参数',[],'boundary'),
        ('T01','holdout','广播控制','播出节点故障后后台持续发送健康探测','请说明监测失联和保持状态的备用接管',['fault_detection','stateful_failover'],'availability'),
        ('T02','holdout','航班查询','大量旅客反复查同一航班余票，座位仍会更新','用数据缓存加快读取并讨论一致性',['cache','cache_consistency'],'performance'),
        ('T03','holdout','隧道传感','危险气体和常规湿度消息大量涌入','让威胁人员安全的事件先获得处理',['event_priority'],'performance'),
        ('T04','holdout','档案转换','不同文件的转换任务互不依赖但全部串行','解释引入并发怎样缓解等待',['response_capacity'],'performance'),
        ('T05','holdout','仓储采购','未来会更换条码扫描设备供应商','把设备差异藏在稳定接口后面减少业务修改',['interface_isolation'],'modifiability'),
        ('T06','holdout','病历交换','不同厂商把同名字段解释为不同单位','交换消息后正确解释含义并适配接口',['semantic_interop','interface_translation'],'interoperability'),
        ('T07','holdout','校友联系簿','校友只可看到获授权的联系方式','从软件架构角度约束信息访问和组件通信',['security'],'security'),
        ('T08','holdout','传感数据上传','偶发网络错误随后会恢复','对重试次数给出边界，避免无休止地等待',['bounded_retry'],'availability'),
        ('T09','holdout','建筑能源控制','费用规则的相似实现散落在不同服务','讨论职责内聚与减少变更连带影响',['cohesive_change','limit_change_propagation'],'modifiability'),
        ('T10','holdout','桌面小工具','想让软件更好','没有说明任务、负载或可测目标',[],'boundary'),
    ]
    fixture.update(version='bv2-expansion-v1', annotationStatus='AI构建、执行前标注，未独立人工认证；测试仅开发隔离非作者盲测',judgments={},reviewNotes={})
    fixture['cases'] = []
    for i,split,title,scenario,req,knowledge,category in definitions:
        fixture['cases'].append(dict(id=i,split=split,request=dict(title=title,scenario=scenario,requirements=req),
            knowledge=knowledge,status='provisional' if knowledge else 'unscorable',control='',
            category=category,qualityAttributes=[category],ambiguity=not bool(knowledge),
            constructionBasis='按真实课程机制构造学生设计任务，非真实用户采样；自然与显式术语混合',
            annotation=dict(required=knowledge,rule='各必要知识分别计；每知识至少一个可用机制替代页，不以目录/关键词替代',
                            weakSupport='概览和相邻一般页仅方向性；未审仍unjudged',confidence='provisional')))
    path.write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n','utf-8')
    freeze = {'fixtureSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'devIDs':[c['id'] for c in fixture['cases'] if c['split']=='dev'],
              'testIDs':[c['id'] for c in fixture['cases'] if c['split']=='holdout'],
              'testSHA256':hashlib.sha256(json.dumps([c for c in fixture['cases'] if c['split']=='holdout'],ensure_ascii=False,sort_keys=True).encode()).hexdigest()}
    dest = root/'data/verification/p3t4-bv2-data-freeze.json'
    if dest.exists(): raise ValueError('Refuse freeze overwrite')
    dest.write_text(json.dumps(freeze,indent=2),'utf-8')
    print(json.dumps(freeze))


if __name__ == '__main__':
    main()
