const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/common.js'), 'utf8');
const cartCode = source.slice(source.indexOf('const Cart ='), source.indexOf('/* ---------- Toast'));
function makeCart(initial) {
  let stored = initial;
  const context = vm.createContext({
    CART_KEY: 'cart',
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    document: { dispatchEvent() {}, querySelectorAll: () => [] },
    CustomEvent: class {},
  });
  return vm.runInContext(cartCode + '\nCart', context);
}
test('cart ignores malformed local data and combines duplicate items', () => {
  assert.equal(makeCart('{').all().length, 0);
  assert.equal(makeCart('{}').all().length, 0);
  const cart = makeCart(JSON.stringify([
    { id: 'p01', qty: 1 }, { id: 'p01', qty: 2 },
    { id: "p01');alert(1)//", qty: 1 }, { id: 'p02', qty: '<img>' },
    { id: 'p03', qty: -1 }, null,
  ]));
  assert.equal(cart.all().length, 1);
  assert.equal(cart.count(), 3);
  cart.add('p01', 2);
  assert.equal(cart.count(), 5);
  cart.setQty('p01', 0);
  assert.equal(cart.count(), 0);
});
