// Only explicit IPs/CIDRs are allowed; never enable Express's trust-all/hop-count modes.
const ipaddr = require('ipaddr.js');
const proxyaddr = require('proxy-addr');

function configureTrustedProxies(value) {
  if (value === undefined || value.trim() === '') return { trust: false, count: 0 };
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length > 100 || entries.some((entry) => !entry))
    throw new Error('TRUSTED_PROXIES phải là danh sách IP/CIDR rõ ràng, phân cách bằng dấu phẩy.');
  try {
    for (const entry of entries) {
      if (entry.includes('/')) {
        const [address, prefix] = ipaddr.parseCIDR(entry);
        // IPv6 ranges containing the entire IPv4-mapped space would trust every IPv4 client.
        const mapsAllIPv4 = address.kind() === 'ipv6' && prefix <= 96 &&
          ipaddr.parse('::ffff:0:0').match(address, prefix);
        if (prefix === 0 || mapsAllIPv4)
          throw new Error('Dải proxy quá rộng.');
      } else {
        ipaddr.parse(entry);
      }
    }
    return { trust: proxyaddr.compile(entries), count: entries.length };
  } catch {
    throw new Error('TRUSTED_PROXIES không hợp lệ. Chỉ chấp nhận IP/CIDR cụ thể, không chấp nhận dải mọi IP.');
  }
}
function clientAddress(req) {
  try {
    const address = ipaddr.parse(req.ip);
    return address.kind() === 'ipv6' && address.isIPv4MappedAddress()
      ? address.toIPv4Address().toString() : address.toString().split('%')[0];
  } catch {
    // Invalid forwarded values share a single bucket rather than becoming arbitrary keys.
    return 'invalid-address';
  }
}
module.exports = { configureTrustedProxies, clientAddress };
