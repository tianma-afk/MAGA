import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Diagram } from './types';

export default function DiagramCanvas({ diagram }: { diagram: Diagram }) {
  const [nodes, , onNodesChange] = useNodesState(
    diagram.nodes.map((node, index) => ({
      id: node.id, data: { label: node.label },
      position: diagram.nodes.length <= 6
        ? { x: 0, y: index * 150 }
        : { x: (index % 2) * 245, y: Math.floor(index / 2) * 150 },
      style: { width: 190, padding: 16, borderRadius: 6, border: '1px solid #bdccc3',
        background: '#fff', color: '#283b31', fontSize: 13, overflowWrap: 'anywhere' as const },
    })),
  );
  const [edges, , onEdgesChange] = useEdgesState(
    diagram.edges.filter(edge => diagram.nodes.some(n => n.id === edge.source)
      && diagram.nodes.some(n => n.id === edge.target)).map((edge, index) => ({
      ...edge, id: `edge-${index}`, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#74877c' }, labelStyle: { fontSize: 12, fill: '#46584c' },
      labelShowBg: true, labelBgStyle: { fill: '#fafbfa' },
      labelBgPadding: [6, 4] as [number, number], labelBgBorderRadius: 3,
    })),
  );
  return <div className="diagram-canvas" aria-label={diagram.title}>
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange} fitView fitViewOptions={{ padding: 0.25 }}
      nodesConnectable={false} deleteKeyCode={null} minZoom={0.2} maxZoom={2}
      ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '放大', 'controls.zoomOut.ariaLabel': '缩小',
        'controls.fitView.ariaLabel': '适应画布', 'controls.ariaLabel': '画布操作' }}>
      <Background color="#dce2de" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
