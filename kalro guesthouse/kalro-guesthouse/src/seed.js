'use strict';
const { q, tx, today, addDays, nightsBetween, audit } = require('./db');
const { hashPassword } = require('./auth');
const billing = require('./billing');

// KALRO's real rooms, from the guesthouse notebook. Letter code: S = single, E = executive, D = double.
const ROOM_TYPES = {
  S: { type: 'Single', beds: '5x6 bed', rate: 1800, rate_double: null, max_guests: 1 },
  E: { type: 'Executive', beds: '6x6 bed', rate: 2000, rate_double: null, max_guests: 1 },
  D: { type: 'Double', beds: 'Double bed', rate: 1800, rate_double: 3000, max_guests: 2 },
};
// null = the notebook gives no letter for this room; it is set aside (Blocked) until a manager confirms the type.
const KALRO_ROOMS = [
  ['01', 'Zebu', 'S'], ['02', 'Jersey', 'S'], ['03', 'Sahiwal', 'S'], ['04', 'Boran', 'E'], ['05', 'Friesian', 'E'],
  ['06', 'Maziwa', 'E'], ['07', 'Butter', 'S'], ['08', 'Cheese', 'S'], ['09', 'Ghee', 'E'], ['10', 'Mursik', 'S'],
  ['11', 'Ngamia', 'S'], ['12', 'Alpine', 'S'], ['13', 'Saanen', 'D'], ['14', 'Galla', 'E'], ['15', 'Oats', 'S'],
  ['16', 'Napier', 'E'], ['17', 'Silage', 'E'], ['18', 'Hay', 'S'], ['19', 'Rhodes', 'S'], ['20', 'Sativa', 'S'],
  ['21', 'Villosa', 'S'], ['23', 'Soya', 'E'], ['24', 'Alba', 'D'], ['25', 'Ipomoea', 'S'],
  ['26', 'Dolicos', 'S'], ['27', 'Sesban', 'S'],
];
// Rooms 23 and 24 are on the second floor; the notebook does not say about the others, so they stay on floor 1.
const SECOND_FLOOR = ['23', '24'];
const GROUND_FLOOR = ['25', '26', '27']; // the rest stay on floor 1 until the notebook says otherwise
const UNCONFIRMED_NOTE = 'Room type not written in the notebook. Set the type and rate, then put the room in service.';

const addRoom = (r) => q.run(
  `INSERT INTO rooms (number,name,type,block,floor,view,beds,rate,rate_double,max_guests,status,status_note)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  r.number, r.name || null, r.type, 'Rooms Block', r.floor ?? 1, r.view || null, r.beds || null, r.rate,
  r.rate_double ?? null, r.max_guests ?? 1, r.status || 'active', r.status_note || null);

// mode: 'kalro' (default) = the real 26 rooms, nothing else; 'demo' = invented sample rooms, guests and venues; 'empty' = no rooms.
function seedCore(opts = {}) {
  const mode = opts.mode || 'kalro';
  if (q.get('SELECT COUNT(*) n FROM users').n > 0) return false;
  tx(() => {
    const mkUser = (username, name, role, pw) => {
      const { salt, hash } = hashPassword(pw);
      q.run('INSERT INTO users (username,name,role,salt,hash) VALUES (?,?,?,?,?)', username, name, role, salt, hash);
    };
    // Default passwords: CHANGE THEM after first login (Users & Roles).
    mkUser('admin', 'System Administrator', 'admin', 'admin123');
    mkUser('manager', 'Guesthouse Manager', 'manager', 'manager123');
    mkUser('reception', 'Front Desk', 'reception', 'reception123');
    mkUser('finance', 'Finance Officer', 'finance', 'finance123');

    if (mode === 'kalro') {
      KALRO_ROOMS.forEach(([number, name, code]) => {
        if (code) addRoom({ number, name, floor: SECOND_FLOOR.includes(number) ? 2 : GROUND_FLOOR.includes(number) ? 0 : 1, ...ROOM_TYPES[code] });
        else addRoom({ number, name, type: 'Unconfirmed', rate: 0, status: 'blocked', status_note: UNCONFIRMED_NOTE });
      });
    }

    if (mode === 'demo') {
      // Invented practice rooms (generous guest limits so every sample booking is valid).
      const room = (number, type, floor, view, beds, rate) => addRoom({ number, type, floor, view, beds, rate, max_guests: 4 });
      for (let n = 101; n <= 110; n++) room(String(n), 'Standard', 1, n % 2 ? 'Courtyard' : 'Farm', '1 double', 4500);
      for (let n = 111; n <= 114; n++) room(String(n), 'Twin Share', 1, 'Courtyard', '2 single', 6000);
      for (let n = 201; n <= 208; n++) room(String(n), 'Deluxe', 2, n % 2 ? 'Garden' : 'Farm', '1 king', 7500);
      for (let n = 401; n <= 403; n++) room(String(n), 'Suite', 4, 'Garden', '1 king + lounge', 12000);

      const am = (name, kind, location, capacity, rate, unit) =>
        q.run('INSERT INTO amenities (name,kind,location,capacity,rate,rate_unit) VALUES (?,?,?,?,?,?)',
          name, kind, location, capacity, rate, unit);
      am('Resource Centre Conference Hall', 'Conference', 'Main Block (Resource Centre)', 120, 25000, 'per day');
      am('Boardroom', 'Conference', 'Main Block (Resource Centre)', 20, 8000, 'per day');
      am('Dining Hall', 'Dining', 'Main Block (Resource Centre)', 80, 0, 'per meal (see menu)');
      am('VIP Lounge', 'Lounge', 'Main Block (Resource Centre)', 15, 5000, 'per session');
      am('Guest Lounge & TV Room', 'Lounge', 'Rooms Block', 25, 0, 'complimentary');
      am('Laundry Service', 'Service', 'Rooms Block', null, 300, 'per item');
    }
  });
  return true;
}
function seedDemo() {
  if (q.get('SELECT COUNT(*) n FROM bookings').n > 0) return false;
  const T = today();
  const admin = q.get("SELECT * FROM users WHERE username='admin'");
  const roomId = (n) => q.get('SELECT id FROM rooms WHERE number=?', n).id;
  const guest = (name, org, phone) =>
    Number(q.run('INSERT INTO guests (name,organisation,phone) VALUES (?,?,?)', name, org, phone).lastInsertRowid);
  const event = (name, venue, s, e, p, org) =>
    Number(q.run('INSERT INTO events (name,venue,start_date,end_date,participants,organiser) VALUES (?,?,?,?,?,?)',
      name, venue, s, e, p, org).lastInsertRowid);

  tx(() => {
    const e1 = event('Maize Genomics Workshop (SAMPLE)', 'Resource Centre Conference Hall', addDays(T, 0), addDays(T, 3), 22, 'Crops Research Unit');
    const e2 = event('Drought Tolerance Seminar (SAMPLE)', 'Boardroom', addDays(T, 2), addDays(T, 4), 12, 'Climate Resilience Unit');

    let ref = 0;
    const book = (g, room, inOff, outOff, o) => {
      ref++;
      const ci = addDays(T, inOff), co = addDays(T, outOff);
      const r = q.get('SELECT rate FROM rooms WHERE number=?', room);
      const id = Number(q.run(
        `INSERT INTO bookings (ref,guest_id,room_id,event_id,check_in,check_out,eta,pax,category,purpose,vip_level,rate,status,created_by,checked_in_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `BK-${T.slice(0, 4)}-${String(ref).padStart(4, '0')}`, g, roomId(room), o.event || null, ci, co, o.eta || null,
        o.pax || 1, o.cat || 'Other', o.purpose || null, o.vip || null, r.rate, o.status || 'confirmed', admin.id,
        o.status === 'checked_in' ? `${ci} ${o.eta || '09:00'}` : null).lastInsertRowid);
      if (o.status === 'checked_in') billing.ensureInvoice(id, admin);
      return id;
    };

    const gOsei = guest('Dr. A. Osei (Sample)', 'Ministry of Agriculture', '+254 700 000 001');
    const gTanui = guest('K. Tanui (Sample)', 'ICAR Delegation', '+254 700 000 002');
    const gWanj = guest('M. Wanjiru (Sample)', 'KALRO Crops Unit', '+254 700 000 003');
    const gBaraka = guest('D. Baraka (Sample)', 'Field Research Team', '+254 700 000 004');
    const gKip = guest('P. Kipchoge (Sample)', 'University of Nairobi', '+254 700 000 005');
    const gMuth = guest('J. Muthoni (Sample)', 'KALRO Dairy Unit', '+254 700 000 006');
    const gOdh = guest('S. Odhiambo (Sample)', 'Training Participants', '+254 700 000 007');

    // today's arrivals
    book(gOsei, '401', 0, 2, { eta: '10:30', cat: 'VIP', vip: 'Protocol 1', purpose: 'Ministerial Visit', pax: 3, status: 'confirmed' });
    const kt = book(gTanui, '204', 0, 3, { eta: '09:15', cat: 'Delegation', purpose: 'ICAR Delegation', pax: 6, status: 'checked_in' });
    book(gWanj, '112', 0, 3, { eta: '14:00', cat: 'Seminar', purpose: 'Seminar: Maize Genomics', event: e1, pax: 8, status: 'confirmed' });
    book(gBaraka, '108', 0, 5, { eta: '16:00', cat: 'Research', purpose: 'Field Research', pax: 4, status: 'pending' });
    // in house
    book(gKip, '103', -2, 1, { eta: '15:00', cat: 'Research', purpose: 'Dairy cattle trial', pax: 5, status: 'checked_in' });
    book(gMuth, '208', -1, 2, { eta: '12:00', cat: 'Seminar', purpose: 'Maize Genomics Workshop', event: e1, pax: 14, status: 'checked_in' });
    book(gOdh, '111', -1, 2, { eta: '17:00', cat: 'Training', purpose: 'AI training for staff', pax: 2, status: 'checked_in' });
    // upcoming
    book(guest('R. Chebet (Sample)', 'Kenya Dairy Board', '+254 700 000 008'), '205', 2, 4, { eta: '11:00', cat: 'Seminar', event: e2, purpose: 'Drought Tolerance Seminar', pax: 6 });
    book(guest('Prof. L. Mwangi (Sample)', 'Egerton University', '+254 700 000 009'), '402', 3, 5, { eta: '13:00', cat: 'VIP', vip: 'Protocol 2', pax: 2 });
    // a departure today + a past stay with paid invoice
    const dep = book(guest('F. Njoroge (Sample)', 'KALRO Livestock Unit', '+254 700 000 010'), '104', -3, 0, { eta: '10:00', cat: 'Research', pax: 3, status: 'checked_in' });
    const past = book(guest('T. Achieng (Sample)', 'Moi University', '+254 700 000 011'), '202', -6, -3, { eta: '14:00', cat: 'Research', pax: 2, status: 'checked_out' });
    q.run("UPDATE bookings SET checked_in_at=?, checked_out_at=? WHERE id=?", `${addDays(T, -6)} 14:00`, `${addDays(T, -3)} 10:00`, past);
    const inv = billing.ensureInvoice(past, admin);
    q.run('INSERT INTO payments (invoice_id,amount,method,reference,paid_on,received_by) VALUES (?,?,?,?,?,?)',
      inv, billing.invoiceTotals(inv).total, 'Bank transfer', 'SAMPLE-REF', addDays(T, -3), admin.id);
    // a partly paid in-house invoice
    const invK = q.get('SELECT id FROM invoices WHERE booking_id=?', kt).id;
    q.run('INSERT INTO invoice_items (invoice_id,description,qty,unit_price,kind) VALUES (?,?,?,?,?)', invK, 'Dinner - Dining Hall', 6, 1200, 'meal');
    q.run('INSERT INTO payments (invoice_id,amount,method,reference,paid_on,received_by) VALUES (?,?,?,?,?,?)', invK, 10000, 'M-Pesa', 'SAMPLE-MPESA', T, admin.id);
    void dep;

    q.run("UPDATE rooms SET status='maintenance', status_note='Plumbing repair (sample)' WHERE number='106'");
    audit(admin, 'seed', 'system', null, 'Sample data loaded');
  });
  return true;
}

module.exports = { seedCore, seedDemo };
