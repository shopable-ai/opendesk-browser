import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeSelectionReceipt} from './k5-sdk-native-selection-receipt.mjs';

const completedAt = '2026-10-07T02:00:00.000Z';
const createdAt = Date.parse(completedAt) - 1000;
const observedAt = Date.parse(completedAt) + 10;

function validReceipt(overrides = {}) {
  const request = {
    state: 'native-selection-assist',
    mode: 'production',
    label: '138',
    uiLabel: '目标方式',
    createdAt,
    pid: 101,
    launcherPid: 100,
    endpoint: 'ws://127.0.0.1/devtools/browser/native',
    targetId: 'tool-target-1',
    selector: '#script-target-mode',
    desired: 'document',
    optionIndex: 1,
    before: {
      value: 'tab',
      selectedIndex: 0,
      options: [
        {value: 'tab', text: '现有网页', disabled: false},
        {value: 'document', text: '精确文档', disabled: false}
      ]
    },
    requestId: 'request-1',
    ackPath: '/tmp/native-selection-ui-ack-request-1.json',
    note: 'CUA must finish; controller must not DOM-assign'
  };
  const axLine = '42 弹出式按钮 目标方式, Value: 精确文档';
  const witness = {
    requestId: 'request-1',
    pid: 101,
    targetId: 'tool-target-1',
    selector: '#script-target-mode',
    desired: 'document',
    beforeAX: '7 弹出式按钮 目标方式, Value: 现有网页',
    menuAX: '9 ID: menuItemSelected: 精确文档',
    afterAX: axLine,
    actualActions: [{click: 7}, {clickMenuItem: 9}],
    completedAt: '2026-10-07T01:59:59.900Z'
  };
  const ack = {
    ...request,
    nativeInputComplete: true,
    noDomAssignment: true,
    noSyntheticEvent: true,
    actualNativeAX: axLine,
    witnessPath: '/tmp/native-selection-ui-ack-request-1-ax.json',
    completedAt
  };
  const after = {
    value: 'document',
    selectedIndex: 1,
    options: structuredClone(request.before.options)
  };
  const observation = {
    at: observedAt,
    monoMs: 33,
    targetId: 'tool-target-1',
    selector: '#script-target-mode',
    desired: 'document',
    before: request.before,
    after,
    ackPath: request.ackPath,
    input: 'native UI assist; exact DOM readback and serial CUA completion acknowledgement',
    requestId: 'request-1'
  };
  const finalDom = structuredClone(after);
  return {...{request, ack, witness, observation, finalDom}, ...overrides};
}

function invalid(mutator) {
  const fixture = validReceipt();
  mutator(fixture);
  return fixture;
}

function assertNativeNotObserved(candidate, pattern) {
  assert.throws(
    () => validateNativeSelectionReceipt(candidate),
    error => error?.code === 'E_NATIVE_NOT_OBSERVED' && pattern.test(error.cause?.message || error.message)
  );
}

test('valid native selection receipt binds request, ack, AX witness, observation and final DOM desired', () => {
  assert.deepEqual(validateNativeSelectionReceipt(validReceipt()), {
    requestId: 'request-1',
    targetId: 'tool-target-1',
    selector: '#script-target-mode',
    desired: 'document',
    observedOptionLabel: '精确文档',
    completedAt,
    observedAt
  });
});

test('rejects stale duplicate or missing matching request IDs', () => {
  assertNativeNotObserved(invalid(f => {
    f.acknowledgements = [f.ack, {...f.ack}];
    delete f.ack;
  }), /exactly one matching requestId/);
  assertNativeNotObserved(invalid(f => {
    f.acknowledgements = [{...f.ack, requestId: 'stale-request'}];
    delete f.ack;
  }), /exactly one matching requestId/);
  assertNativeNotObserved(invalid(f => {
    f.ack.requestId = 'wrong-request';
  }), /ack\.requestId/);
});

test('rejects wrong native target, selector or desired value', () => {
  assertNativeNotObserved(invalid(f => {
    f.ack.targetId = 'another-tool-target';
  }), /ack\.targetId/);
  assertNativeNotObserved(invalid(f => {
    f.observation.selector = '#sdk-document';
  }), /observation\.selector/);
  assertNativeNotObserved(invalid(f => {
    f.ack.desired = 'tab';
  }), /ack\.desired/);
});

test('rejects wrong observed option value or label', () => {
  assertNativeNotObserved(invalid(f => {
    f.observation.after.value = 'tab';
  }), /observation\.after\.value/);
  assertNativeNotObserved(invalid(f => {
    f.observation.after.options[1] = {...f.observation.after.options[1], text: '现有网页'};
  }), /selected option label/);
});

test('rejects missing AX readback or missing native action marker', () => {
  assertNativeNotObserved(invalid(f => {
    delete f.ack.actualNativeAX;
  }), /ack\.actualNativeAX/);
  assertNativeNotObserved(invalid(f => {
    f.witness.afterAX = '42 弹出式按钮 目标方式, Value: 现有网页';
  }), /witness\.afterAX/);
  assertNativeNotObserved(invalid(f => {
    f.witness.actualActions = [{click: 7}, {key: 'space'}];
  }), /clickMenuItem/);
  assertNativeNotObserved(invalid(f => {
    f.ack.nativeInputComplete = false;
  }), /nativeInputComplete/);
});

test('rejects missing or stale post-request DOM readback', () => {
  assertNativeNotObserved(invalid(f => {
    delete f.finalDom;
  }), /finalDom must be an object/);
  assertNativeNotObserved(invalid(f => {
    f.finalDom.value = 'tab';
  }), /finalDom\.value/);
  assertNativeNotObserved(invalid(f => {
    f.observation.at = Date.parse(completedAt) - 1;
  }), /observation\.at/);
});

test('rejects missing uiLabel and stale completion before request creation', () => {
  assertNativeNotObserved(invalid(f => {
    delete f.request.uiLabel;
  }), /request\.uiLabel/);
  assertNativeNotObserved(invalid(f => {
    f.ack.completedAt = new Date(createdAt - 1).toISOString();
  }), /ack\.completedAt/);
  assertNativeNotObserved(invalid(f => {
    f.witness.completedAt = new Date(createdAt - 1).toISOString();
  }), /witness\.completedAt/);
});
