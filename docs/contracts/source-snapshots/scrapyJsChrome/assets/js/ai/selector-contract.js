/* Shared JSON contract. No DOM, network, scripts or provider secrets. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AISelectorContract = api;
})(globalThis, function () {
    'use strict';
    const VERSION = '1.0';
    const MAX_BYTES = 50 * 1024;
    const ATTRIBUTES = [null, 'href', 'src', 'alt', 'title', 'datetime', 'content'];
    const TYPES = ['text', 'number', 'url', 'image', 'date'];
    const RESERVED = new Set(['constructor', 'prototype', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']);
    function fail(message, errorCode = 'E_AI_SCHEMA') {
        const error = new Error(message); error.errorCode = errorCode; throw error;
    }
    function object(value, name) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} 必须是对象`);
    }
    function string(value, name, max = 500, empty = false) {
        if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(`${name} 无效`);
    }
    function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
    function key(value) {
        if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value) || RESERVED.has(value)) fail('字段 key 无效或保留');
    }
    function selector(value, field = false) {
        string(value, 'selector', 500);
        if (/::|\/\/|[{};`]|\b(?:javascript|eval|function)\b/i.test(value)) fail('仅支持 CSS 后代 selector 和声明的属性后缀');
        if (field && /^:scope\s*$/.test(value)) fail('当前引擎不能提取记录自身');
        return value;
    }
    function unique(values, name) {
        if (new Set(values).size !== values.length) fail(`${name} 不可重复`);
    }
    function validateRequestedFields(fields) {
        if (!Array.isArray(fields) || !fields.length || fields.length > 20) fail('请确认 1–20 个字段');
        for (const f of fields) {
            object(f, 'field'); key(f.key); string(f.label, 'label', 80);
            if (!TYPES.includes(f.valueType) || typeof f.required !== 'boolean') fail('字段类型或 required 无效');
        }
        unique(fields.map(f => f.key), '字段 key');
        return fields;
    }
    function validateRequest(request) {
        object(request, 'request');
        if (bytes(request) > MAX_BYTES) fail('请求超过 50 KiB');
        if (request.schemaVersion !== VERSION) fail('协议版本不支持');
        string(request.requestId, 'requestId', 100); string(request.snapshotId, 'snapshotId', 100);
        string(request.intent, 'intent', 1500);
        validateRequestedFields(request.requestedFields);
        object(request.page, 'page'); string(request.page.url, 'page.url', 1000);
        const candidates = request.candidates;
        if (!Array.isArray(candidates) || !candidates.length || candidates.length > 3) fail('候选数量必须为 1–3');
        unique(candidates.map(c => c.candidateId), 'candidateId');
        for (const c of candidates) {
            object(c, 'candidate'); string(c.candidateId, 'candidateId', 80); selector(c.containerSelector);
            if (c.rowMode !== 'directChildren' || !Number.isInteger(c.rowCount) || c.rowCount < 1) fail('仅支持直接子记录');
            if (!Array.isArray(c.sources) || !c.sources.length || c.sources.length > 20) fail('来源数量必须为 1–20');
            if (!Array.isArray(c.samples) || c.samples.length > 5) fail('候选样例超过 5 条');
            unique(c.sources.map(s => s.sourceId), 'sourceId');
            for (const s of c.sources) {
                object(s, 'source'); string(s.sourceId, 'sourceId', 80); selector(s.selector, true);
                string(s.tag, 'tag', 30);
                if (!Array.isArray(s.attributes) || !s.attributes.length || s.attributes.some(a => !ATTRIBUTES.includes(a))) fail('来源属性无效');
                if (!Array.isArray(s.samples) || s.samples.length > 5) fail('来源样例超过 5 条');
                for (const sample of s.samples) {
                    object(sample, 'sample');
                    for (const [name, value] of Object.entries(sample)) {
                        if (!['text', 'href', 'src', 'alt', 'title', 'datetime', 'content', 'hits'].includes(name)) fail('样例属性不允许');
                        if (name === 'hits') { if (!Number.isInteger(value) || value < 0) fail('hits 无效'); }
                        else string(value, 'sample value', 1000, true);
                    }
                }
            }
        }
        return request;
    }
    function compileProposal(proposal, request) {
        validateRequest(request); object(proposal, 'proposal');
        if (bytes(proposal) > MAX_BYTES || proposal.schemaVersion !== VERSION) fail('建议规模或协议版本无效');
        if (proposal.requestId !== request.requestId || proposal.snapshotId !== request.snapshotId) fail('建议请求或页面已过期', 'E_AI_STALE');
        if (proposal.status === 'needs_context') fail('候选不足：' + (proposal.warnings || []).join('；'), 'E_AI_VALIDATION');
        if (proposal.status !== 'proposal' || !Array.isArray(proposal.fields) || !proposal.fields.length || proposal.fields.length > 20) fail('空建议或状态无效');
        const candidate = request.candidates.find(c => c.candidateId === proposal.candidateId);
        if (!candidate) fail('未知候选', 'E_AI_UNKNOWN_CANDIDATE');
        unique(proposal.fields.map(f => f.key), '建议字段');
        const itemConfig = { _listContainer: candidate.containerSelector }, labels = {};
        for (const f of proposal.fields) {
            object(f, 'proposal field'); key(f.key);
            const requested = request.requestedFields.find(r => r.key === f.key);
            if (!requested || f.required !== requested.required || (f.valueType !== undefined && f.valueType !== requested.valueType)) fail('字段必须遵循用户确认的名称、类型和必需性');
            const source = candidate.sources.find(s => s.sourceId === f.sourceId);
            if (!source) fail('未知字段来源', 'E_AI_UNKNOWN_CANDIDATE');
            if (!ATTRIBUTES.includes(f.attribute) || !source.attributes.includes(f.attribute)) fail('属性未声明或不支持');
            itemConfig[f.key] = source.selector + (f.attribute === null ? '' : `::${f.attribute}`);
            labels[f.key] = requested.label;
        }
        for (const f of request.requestedFields) if (f.required && !Object.hasOwn(itemConfig, f.key)) fail(`缺少必需字段 ${f.key}`);
        if (!proposal.pagination || proposal.pagination.mode !== 'none' || proposal.pagination.nextCandidateId != null) fail('首版 AI 仅生成单页配置；scroll 和未登记的下一页不支持');
        if (proposal.warnings !== undefined && (!Array.isArray(proposal.warnings) || proposal.warnings.length > 20 || proposal.warnings.some(w => typeof w !== 'string' || w.length > 1000))) fail('warnings 无效');
        return { itemConfig, labels, pagination: { mode: 'none', pageLimit: 1, nextPageSelector: '' } };
    }
    return { VERSION, MAX_BYTES, ATTRIBUTES, TYPES, bytes, fail, selector, validateRequestedFields, validateRequest, compileProposal };
});
