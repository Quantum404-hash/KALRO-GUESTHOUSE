// Run against a CLEAN server:  node src/server.js --empty   (port via PORT=3111)
const B = 'http://localhost:3111/api';
const call = async (m, p, t, b) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json() };
};
const tok = async (u, p) => (await call('POST', '/auth/login', null, { username: u, password: p })).j.token;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); };
const mgr = await tok('manager', 'manager123'), rec = await tok('reception', 'reception123');

ok('clean start has no rooms', (await call('GET', '/rooms', mgr)).j.rooms.length === 0);
ok('dashboard works with zero rooms', (await call('GET', '/dashboard', mgr)).s === 200);

ok('reception cannot add rooms (403)', (await call('POST', '/rooms', rec, { number: '1', type: 'Std', rate: 1000 })).s === 403);
let r = await call('POST', '/rooms', mgr, { number: 'A1', type: 'Executive', floor: 0, beds: '1 king', view: 'Lawn', rate: 8200 });
ok('manager adds a room with a custom type, ground floor', r.s === 200 && r.j.type === 'Executive' && r.j.floor === 0, JSON.stringify(r.j));
ok('duplicate number rejected (case-insensitive)', (await call('POST', '/rooms', mgr, { number: 'a1', type: 'X', rate: 1 })).s === 409);
ok('missing rate rejected', (await call('POST', '/rooms', mgr, { number: 'B1', type: 'X' })).s === 400);
ok('bad number characters rejected', (await call('POST', '/rooms', mgr, { number: '<b>', type: 'X', rate: 1 })).s === 400);

r = await call('POST', '/rooms/bulk', mgr, { rooms: [
  { line: 1, number: '101', type: 'Standard', floor: 1, beds: '1 double', view: 'Garden', rate: '4500' },
  { line: 2, number: '102', type: 'Standard', floor: 1, beds: '1 double', view: 'Farm', rate: '4500' },
  { line: 3, number: '201', type: 'Suite', floor: 2, beds: '1 king', view: 'Garden', rate: '12000' }] });
ok('bulk add of 3 rooms', r.s === 200 && r.j.added === 3, JSON.stringify(r.j));
r = await call('POST', '/rooms/bulk', mgr, { rooms: [
  { line: 1, number: '301', type: 'Standard', floor: 3, rate: '4500' },
  { line: 2, number: '101', type: 'Standard', floor: 1, rate: '4500' },
  { line: 3, number: '302', type: 'Standard', floor: 3, rate: 'abc' },
  { line: 4, number: '301', type: 'Standard', floor: 3, rate: '4500' }] });
ok('bulk with errors adds nothing and lists the bad lines', r.s === 400 && /Line 2/.test(r.j.error) && /Line 3/.test(r.j.error) && /Line 4/.test(r.j.error), r.j.error);
const rooms = (await call('GET', '/rooms', mgr)).j.rooms;
ok('nothing from the failed bulk was saved', rooms.length === 4 && !rooms.some((x) => x.number === '301'), rooms.map((x) => x.number).join());

const s101 = rooms.find((x) => x.number === '101');
r = await call('PATCH', `/rooms/${s101.id}`, mgr, { number: '101', type: 'Standard Plus', floor: 1, beds: '1 double', view: 'Garden', rate: 5000, status: 'active' });
ok('edit type and rate', r.s === 200 && r.j.type === 'Standard Plus' && r.j.rate === 5000, JSON.stringify(r.j));
ok('renaming onto an existing number is rejected', (await call('PATCH', `/rooms/${s101.id}`, mgr, { number: '102' })).s === 409);

const d = (await call('GET', '/dashboard', mgr)).j;
ok('dashboard availability follows the real types, priciest first', d.availability.map((a) => a.type).join() === 'Suite,Executive,Standard Plus,Standard', d.availability.map((a) => a.type).join());

// booking history protects a room from deletion
const T = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const bk = await call('POST', '/bookings', rec, { guest: { name: 'Test' }, room_id: s101.id, check_in: T, check_out: tomorrow, pax: 1 });
ok('room is bookable', bk.s === 200, JSON.stringify(bk.j));
ok('room with bookings cannot be deleted', (await call('DELETE', `/rooms/${s101.id}`, mgr)).s === 409);
const s201 = rooms.find((x) => x.number === '201');
ok('unused room can be deleted', (await call('DELETE', `/rooms/${s201.id}`, mgr)).s === 200);
console.log(`\n${pass} passed, ${fail} failed`);
