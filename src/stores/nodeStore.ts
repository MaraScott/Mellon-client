import {
    Edge,
    Node,
    OnConnect,
    NodeChange,
    EdgeChange,
    OnNodesChange,
    OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
    Connection,
    getOutgoers,
    getIncomers,
} from '@xyflow/react';
import { createWithEqualityFn } from 'zustand/traditional';
import { nanoid } from 'nanoid';

import config from '../../config';

export type GroupParams = {
    key: string;
    display: 'group' | 'collapse';
    label?: string | null;
    hidden?: boolean;
    disabled?: boolean;
    open?: boolean;
    direction?: 'row' | 'column';
}

export type NodeParams = {
    type?: string | string[];
    label?: string;
    display?: string;
    value?: any;
    spawn?: boolean;
    options?: any;
    default?: any;
    description?: string;
    source?: string;
    min?: number;
    max?: number;
    step?: number;
    group?: GroupParams;
    style?: { [key: string]: string };
    no_validation?: boolean;
    disabled?: boolean;
    hidden?: boolean;
    onChange?: any;
    icon?: string;
};

type NodeData = {
    module: string;
    action: string;
    category: string;
    params: { [key: string]: NodeParams };
    cache?: boolean;
    time?: number;
    memory?: number;
    label?: string;
    description?: string;
    resizable?: boolean;
    groups?: { [key: string]: { disabled?: boolean, hidden?: boolean, open?: boolean } };
    style?: { [key: string]: string };
};

type StoredWorkflow = {
    nodes: CustomNodeType[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number };
  };

export type CustomNodeType = Node<NodeData, 'custom'>;

// Data format for API export
type APINodeData = {
    // TODO: we also need a workflow id probably
    module: string;
    action: string;
    params: {
        [key: string]: {
            sourceId?: string,
            sourceKey?: string,
            value?: any,
            display?: string,
            type?: string | string[]
        }
    };
};

type GraphExport = {
    sid: string;
    nodes: { [key: string]: APINodeData };
    paths: string[][];
};

const formatAPIData = (node: CustomNodeType, edge: Edge[]): APINodeData => {
    const inputEdges = edge.filter(e => e.target === node.id);
    const params: APINodeData['params'] = {};

    Object.entries(node.data.params).forEach(([key, param]) => {
        // We don't need to export output parameters
        if (param.display === 'output') {
            return;
        }

        const edge = inputEdges.find(e => e.targetHandle === key);

        params[key] = {
            sourceId: edge?.source ?? undefined,
            sourceKey: (edge ? edge.sourceHandle : param.source) ?? undefined,
            value: param.value ?? undefined,
            display: param.display ?? undefined,
            type: param.type ?? undefined
        };
    });

    return {
        module: node.data.module,
        action: node.data.action,
        params
    };
};

/*
const findOutputNode = (nodes: CustomNodeType[], edges: Edge[]): CustomNodeType[] => {
    const outputNodes = new Set(edges.map(edge => edge.source));
    return nodes.filter(node => !outputNodes.has(node.id));
};
*/

const buildPath = (
    currentNode: string,
    nodes: CustomNodeType[],
    edges: Edge[],
    visited: Set<string> = new Set()
): string[] => {
    if (visited.has(currentNode)) return []; // Prevent cycles
    visited.add(currentNode);

    // Get all incoming edges to this node
    //const incomingEdges = edges.filter(edge => edge.target === currentNode);
    const node = nodes.find(n => n.id === currentNode);
    if (!node) return [];
    
    const incomingNodes = getIncomers(node, nodes, edges);

    // If this is an input node (no incoming edges), return just this node
    if (incomingNodes.length === 0) {
        return [currentNode];
    }

    const inputPaths = incomingNodes.flatMap(sourceNode =>
        buildPath(sourceNode.id, nodes, edges, new Set(visited))
    );

    return [...inputPaths, currentNode];
};

export type NodeState = {
    nodes: CustomNodeType[];
    edges: Edge[];
    onNodesChange: OnNodesChange<CustomNodeType>;
    onEdgesChange: OnEdgesChange;
    onEdgeDoubleClick: (id: string) => void;
    onConnect: OnConnect;
    addNode: (node: CustomNodeType) => void;
    setParamValue: (id: string, key: string, value: any) => void;
    setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => void;
    getParam: (id: string, param: string, key: keyof NodeParams) => any;
    setNodeExecuted: (id: string, cache: boolean, time: number, memory: number) => void;
    exportGraph: (sid: string) => GraphExport;
    updateLocalStorage: () => void;
};

export const useNodeState = createWithEqualityFn<NodeState>((set, get) => ({
    nodes: JSON.parse(localStorage.getItem('workflow') || '{"nodes":[]}').nodes || [],
    edges: JSON.parse(localStorage.getItem('workflow') || '{"edges":[]}').edges || [],

    onNodesChange: async (changes: NodeChange<CustomNodeType>[]) => {
        const newNodes = applyNodeChanges(changes, get().nodes);
        set({ nodes: newNodes });

        // Save to localStorage after changes
        const stored = localStorage.getItem('workflow');
        const { viewport } = stored ? JSON.parse(stored) : { viewport: { x: 0, y: 0, zoom: 1 } };
        const workflow: StoredWorkflow = { nodes: newNodes, edges: get().edges, viewport };
        localStorage.setItem('workflow', JSON.stringify(workflow));
        
        // delete the server cache for the deleted nodes
        if (changes.some(change => change.type === 'remove')) {
            // Create an array of node ids to delete
            const nodeIds = changes.filter(change => change.type === 'remove').map(change => change.id);
            
            try {
                await fetch('http://' + config.serverAddress + '/clearNodeCache', {
                    method: 'DELETE',
                    body: JSON.stringify({ nodeId: nodeIds }),
                });
            } catch (error) {
                console.error('Can\'t connect to server to clear cache:', error);
                // TODO: should we retry?
            }
        }
    },
    onEdgesChange: (changes: EdgeChange<Edge>[]) => {
        const newEdges = applyEdgeChanges(changes, get().edges);

        // Handle array disconnections
        const removedEdges = changes.filter(change => change.type === 'remove');
        for (const removedEdge of removedEdges) {
            const edge = get().edges.find(e => e.id === removedEdge.id);
            const spawnHandle = get().getParam(edge?.target!, edge?.targetHandle!, 'spawn');
            if (edge && spawnHandle) {
                const targetNode = get().nodes.find(n => n.id === edge.target);
                if (targetNode) {
                    // Remove the specific parameter that was disconnected
                    set({
                        nodes: get().nodes.map(node => {
                            if (node.id === edge.target) {
                                const { [edge.targetHandle!]: _, ...remainingParams } = node.data.params;
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        params: remainingParams
                                    }
                                };
                            }
                            return node;
                        })
                    });
                }
            }
        }

        set({ edges: newEdges });
        get().updateLocalStorage();
    },
    onEdgeDoubleClick: (id: string) => {
        const edgeChange: EdgeChange = {
            id,
            type: 'remove'
        };
        
        // Use the existing onEdgesChange handler to process the removal
        get().onEdgesChange([edgeChange]);
    },
    onConnect: (conn: Connection) => {
        const updatedEdges = get().edges.filter(
            edge => !(edge.target === conn.target && edge.targetHandle === conn.targetHandle)
        );

        // find the color of the target handle
        const targetHandleEl = document.getElementById(conn.target)?.querySelector(`[data-key="${conn.targetHandle}"] .react-flow__handle`);
        const backgroundColor = targetHandleEl ? window.getComputedStyle(targetHandleEl).backgroundColor : '#aaaaaa';
        const newEdge = { ...conn, id: nanoid(), style: { stroke: backgroundColor } };
        const newEdges = [...updatedEdges, newEdge];
        const spawnHandle = get().getParam(conn.target, conn.targetHandle!, 'spawn');

        // Check if this connection is replacing an existing one
        const isReconnection = get().edges.some(
            edge => edge.target === conn.target && edge.targetHandle === conn.targetHandle
        );

        // Handle array connections
        if (spawnHandle && !isReconnection) {
            const targetNode = get().nodes.find(n => n.id === conn.target);
            if (targetNode) {
                const baseParamKey = conn.targetHandle!.replace(/(\[\d*\])?$/, '');
                const arrayParams = Object.keys(targetNode.data.params)
                    .filter(k => k.startsWith(baseParamKey));

                // we can spawn maximum 32 array parameters
                if (arrayParams.length > 32) {
                    return;
                }

                // find the biggest index of the array params
                const nextIndex = Math.max(...arrayParams.map(k => {
                    const match = k.match(/\[\d*\]$/);
                    return match ? parseInt(match[0].replace('[', '').replace(']', '') || '0') : 0;
                }));
                const newParamKey = `${baseParamKey}[${nextIndex + 1}]`;

                // Clone the base parameter
                const baseParam = targetNode.data.params[conn.targetHandle!];

                // Reorder parameters to keep array fields together
                const orderedParams: { [key: string]: NodeParams } = {};
                Object.entries(targetNode.data.params).forEach(([key, value]) => {
                    orderedParams[key] = value;
                    // Insert the new parameter right after finding an array parameter of the same type
                    if (key === conn.targetHandle) {
                        orderedParams[newParamKey] = { ...baseParam };
                    }
                });

                set({
                    nodes: get().nodes.map(node => {
                        if (node.id === conn.target) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    params: orderedParams
                                }
                            };
                        }
                        return node;
                    })
                });
            }
        }

        set({ edges: newEdges });
        get().updateLocalStorage();
    },
    addNode: (node: CustomNodeType) => {
        //const newNode = { ...node, dragHandle: 'header' };

        // Set initial value for all parameters, TODO: needed? default value should be exported by the server
        if (node.data?.params) {
            Object.keys(node.data.params).forEach(key => {
                const param = node.data.params[key];
                node.data.params[key] = {
                    ...param,
                    value: param.value ?? param.default
                };
            });
        }
        const newNodes = [...get().nodes, node];
        set({ nodes: newNodes });

        // Save to localStorage after changes
        const workflow: StoredWorkflow = { nodes: newNodes, edges: get().edges };
        localStorage.setItem('workflow', JSON.stringify(workflow));
    },
    setParamValue: (id: string, key: string, value: any) => {
        set({
            nodes: get().nodes.map((node) => (
                node.id === id
                ? {
                    ...node,
                    data: {
                        ...node.data,
                        params: {
                            ...node.data.params,
                            [key]: {
                                ...node.data.params[key],
                                value: value
                            }
                        }
                    }
                }
                : node
            )) // is this real life?
        });
        
        get().updateLocalStorage();
    },
    updateLocalStorage: () => {
        const stored = localStorage.getItem('workflow');
        const { viewport } = stored ? JSON.parse(stored) : { viewport: { x: 0, y: 0, zoom: 1 } };
        const workflow: StoredWorkflow = { nodes: get().nodes, edges: get().edges, viewport };
        localStorage.setItem('workflow', JSON.stringify(workflow));
    },
    setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => {
        const k = key ?? 'value';

        if (k !== 'group') {
            set({
                nodes: get().nodes.map((node) => (
                    node.id === id
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            params: {
                                ...node.data.params,
                                [param]: {
                                    ...node.data.params[param],
                                    [k]: value
                                }
                            }
                        }
                    }
                    : node
                )) // is this real life?
            });
        } else {
            set({
                nodes: get().nodes.map((node) => (
                    node.id === id
                    ? { ...node, data: { ...node.data, groups: { ...node.data.groups, [param]: { ...node.data.groups?.[param], ...value } } } }
                    : node
                ))
            });
        }

        get().updateLocalStorage();
    },
    getParam: (id: string, param: string, key: keyof NodeParams) => {
        const node = get().nodes.find(n => n.id === id);
        return node?.data.params[param][key];
    },
    setNodeExecuted: (id: string, cache: boolean, time: number, memory: number) => {
        set({ nodes: get().nodes.map(node => (node.id === id ? { ...node, data: { ...node.data, cache, time, memory } } : node)) });
    },
    exportGraph: (sid: string) => {
        const { nodes, edges } = get();
        const outputNodes = nodes.filter(node => getOutgoers(node, nodes, edges).length === 0); //findOutputNode(nodes, edges);
        const paths = outputNodes.map(node => buildPath(node.id, nodes, edges));

        const nodesLookup = nodes.reduce((acc, node) => ({
            ...acc,
            [node.id]: formatAPIData(node, edges)
        }), {});

        const graphData: GraphExport = {
            sid: sid ?? '',
            nodes: nodesLookup,
            paths
        };

        return graphData;
    }
}));
