const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  if (typeof args[0] === 'string' && !/^\d+$/.test(args[0])) return original.apply(this,args);
  throw new Error('OFFLINE_AUDIT_NETWORK_BLOCKED');
};
globalThis.fetch = async () => { throw new Error('OFFLINE_AUDIT_NETWORK_BLOCKED'); };
