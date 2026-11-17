"""Freeze six new queries before invoking unchanged P3T3 workers."""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    out = root / 'data/verification/p3t4-supplement-20261117-v1'
    out.mkdir(parents=True, exist_ok=False)
    fixture = json.loads((root / 'docs/fixtures/iteration3-design-needs-v4.json').read_text('utf-8'))
    definitions = [
        ('S01', '园区门禁', '控制节点失联后，备用节点要接着处理刷卡记录',
         '定期判断节点是否还活着，切换时保留已处理记录', ['fault_detection', 'stateful_failover']),
        ('S02', '数字图书馆', '热门书目列表每秒被多次读取，后台偶尔修改目录',
         '用缓存降低慢存储读取次数，并解释缓存与原始数据不同步的处理代价', ['cache', 'cache_consistency']),
        ('S03', '冷链监控', '车辆同时上报正常温度和药品超温通知',
         '消息积压时让影响药品安全的通知优先被处理', ['event_priority']),
        ('S04', '快递聚合', '应用需要经常更换不同承运公司的接单服务',
         '通过稳定接口隔离外部供应商变化，避免每次都改订单业务', ['interface_isolation']),
        ('S05', '在线协作白板', '多个班级在同一时段持续上传笔画，服务器出现等待',
         '提高并发处理能力，解释增加处理资源与减少资源争用的作用', ['response_capacity']),
        ('S06', '实验室预约', '访客可以查空闲时段，只有负责人能读学生的联系方式',
         '限制信息访问并保护组件之间传递的数据', ['security']),
    ]
    fixture.update(version='decision-supplement-v1', annotationStatus='Codex事前选择及标注建议；非独立人工金标准；非原保留集',
                   judgments={}, reviewNotes={'selection': '六条涵盖可用性/性能/可修改性/安全；自然表达与显式术语混合；同作者知悉旧案例，不能称独立盲测；未看新返回结果，未调算法。'})
    fixture['cases'] = [dict(id=i, split='dev', request=dict(title=t, scenario=s, requirements=r),
                             knowledge=k, status='provisional', control='') for i,t,s,r,k in definitions]
    fixture_path = root / 'docs/fixtures/iteration3-decision-supplement.json'
    if fixture_path.exists():
        raise ValueError('Refuse fixture overwrite')
    fixture_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2)+'\n', 'utf-8')
    protocol = root / 'docs/iteration3_jack/phase3-decision-supplement-protocol.md'
    worker = root / 'scripts/compare-design-worker.py'
    spec = importlib.util.spec_from_file_location('comparison', root / 'scripts/run-design-comparison.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    freeze = dict(createdUTC=datetime.now(timezone.utc).isoformat(), versions=mod.VERSIONS,
                  hashes={str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in (fixture_path, protocol, worker, Path(__file__))},
                  realBudget=6, mainHead=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip())
    (out/'freeze.json').write_text(json.dumps(freeze,ensure_ascii=False,indent=2),'utf-8')
    env = os.environ.copy()
    env.update(PYTHONIOENCODING='utf-8')
    env.pop('PYTHON_DOTENV_DISABLED', None)
    for variant in ('baseline','a','b','c'):
        cmd = [sys.executable,str(worker),'--repo',str(root.parent/('MAGA-exp-'+variant)),
               '--expected-head',mod.VERSIONS[variant],'--variant',variant,'--fixture',str(fixture_path),
               '--protocol',str(protocol),'--output',str(out/variant),'--split','dev','--repeats','1',
               '--ledger',str(out/'real-attempts.jsonl'),'--budget','6']
        print(variant,flush=True)
        result = subprocess.run(cmd,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8')
        (out/(variant+'.log')).write_text(result.stdout,'utf-8')
        if result.returncode:
            raise RuntimeError('Worker failed; no retry: '+variant)
    freeze['finishedUTC'] = datetime.now(timezone.utc).isoformat()
    (out/'freeze.json').write_text(json.dumps(freeze,ensure_ascii=False,indent=2),'utf-8')


if __name__ == '__main__':
    main()
