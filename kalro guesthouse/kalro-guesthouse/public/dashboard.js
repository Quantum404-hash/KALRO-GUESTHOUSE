'use strict';
const ALL = ['admin', 'manager', 'reception', 'finance'];
const FRONT = ['admin', 'manager', 'reception'];
const MONEY = ['admin', 'manager', 'finance'];
const BOSS = ['admin', 'manager'];

let ROOMS_CACHE = [];
const TYPE_SHORT = { 'Twin Share': 'Twin' };
// "21 Villosa" when the room has a name, otherwise just the number.
const rm = (o) => (o.room_name || o.name ? `${o.room_number || o.number} ${o.room_name || o.name}` : (o.room_number || o.number));

/* The building map: one row per floor of the Rooms Block (the building at the back). */
function buildingMap(rooms, o = {}) {
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => b - a);
  const oneFloor = floors.length === 1; // KALRO has not told us the floors yet, so show one block of rooms
  return html`<div class="building">
    <div class="roofline" aria-hidden="true"></div>
    ${floors.map((f) => {
      const fr = rooms.filter((r) => r.floor === f);
      const types = [...new Set(fr.map((r) => r.type))].join(', ');
      return html`<div class="floor"><div class="lbl">${oneFloor ? 'All rooms' : f === 0 ? 'Ground floor' : `Floor ${f}`}<span>${types}</span></div>
        <div class="tiles ${o.wide ? 'wide' : ''}">${fr.map((r) => roomTile(r, o))}</div></div>`;
    })}
    <div class="legend">
      <span><i></i>Vacant</span><span><i class="l-occupied"></i>Occupied</span><span><i class="l-reserved"></i>Reserved today</span>
      <span><i class="l-maintenance"></i>Maintenance</span><span><i class="l-blocked"></i>Blocked</span>
    </div></div>`;
}
function roomTile(r, o = {}) {
  const sub = r.state === 'occupied' || r.state === 'reserved' ? r.current?.guest_name
    : r.state === 'maintenance' ? 'Maintenance' : r.state === 'blocked' ? 'Blocked' : (TYPE_SHORT[r.type] || r.type);
  let cls = r.state;
  if (o.dimUnless && !o.dimUnless(r)) cls += ' dim';
  if (o.highlight && o.highlight(r)) cls += ' range-free';
  return html`<button type="button" class="tile ${cls}" data-act="room" data-id="${r.id}" title="Room ${rm(r)}, ${r.type}, ${r.state}">
    ${r.departing_today ? html`<span class="dot" title="Due out today"></span>` : ''}
    <b>${r.number}</b>${r.name ? html`<em class="rname">${r.name}</em>` : ''}<small>${sub}</small>${o.wide ? html`<small>${r.rate_double ? `${num(r.rate)} / ${num(r.rate_double)}` : kes(r.rate)}</small>` : ''}</button>`;
}

const arrivalRow = (a) => html`<div class="arrival">
  <div class="avatar">${initials(a.guest_name)}</div>
  <div class="who"><b>${a.guest_name}${a.vip_level ? html`<span class="chip vip">VIP, ${a.vip_level}</span>` : ''}</b>
    <span>${a.purpose || a.category}, room ${rm(a)} (${a.room_type})${a.pax > 1 ? `, ${a.pax} guests` : ''}</span></div>
  <div class="end">
    ${a.overdue ? html`<span class="chip st-overdue">Late, due ${fdate(a.check_in)}</span>` : chip(a.status)}
    ${a.eta ? html`<span class="small muted">ETA ${a.eta}</span>` : ''}
    ${a.status !== 'checked_in' && can(...FRONT) ? html`<button class="btn sm primary" data-act="checkin" data-id="${a.id}">Check in</button>` : ''}
  </div></div>`;

PAGES.dashboard = {
  roles: ALL,
  async render(host) {
    const [d, rr] = await Promise.all([get('/dashboard'), get('/rooms')]);
    ROOMS_CACHE = rr.rooms;
    const hour = Number(d.now.slice(0, 2));
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const s = d.stats;
    mount(host, html`
      ${pageHead(greet, `${fdateY(d.date)}. Here is how the guesthouse stands right now.`,
        can(...FRONT) ? html`<button class="btn primary" data-act="new-booking">${icon('plus', 16)} New booking</button>` : '')}
      <div class="kpis">
        <div class="kpi"><div class="n">${s.occupancyPct}%</div><div class="l">Occupancy tonight</div><div class="s">${s.busyTonight} of ${s.rooms - s.outOfService} rooms in use</div></div>
        <div class="kpi"><div class="n">${s.expectedArrivals}</div><div class="l">Still to arrive</div><div class="s">${s.arrivalsToday} on today's list</div></div>
        <div class="kpi ${s.dueOut ? 'alert' : ''}"><div class="n">${s.dueOut}</div><div class="l">Due out today</div><div class="s">${s.dueOut ? 'Guests leaving' : 'Nobody leaving'}</div></div>
        <div class="kpi"><div class="n">${d.inHouse.total}</div><div class="l">Guests in house</div><div class="s">in ${d.inHouse.rooms} rooms</div></div>
        ${d.money ? html`<div class="kpi"><div class="n" style="font-size:24px">${kes(d.money.runningBills)}</div><div class="l">Running bills</div><div class="s">Guests still in house, pay at checkout</div></div>
        <div class="kpi good"><div class="n" style="font-size:24px">${kes(d.money.collectedThisMonth)}</div><div class="l">Collected this month</div><div class="s">All payments received</div></div>
        <div class="kpi ${d.money.outstanding ? 'alert' : ''}"><div class="n" style="font-size:24px">${kes(d.money.outstanding)}</div><div class="l">Unpaid after checkout</div><div class="s">Guests who left without paying</div></div>` : ''}
      </div>
      <div class="grid-2">
        <div class="stack">
          <section class="panel"><header><h2>Rooms block</h2><span class="muted small">Tap a room for details</span></header>${buildingMap(rooms(d, rr))}</section>
          <section class="panel"><header><h2>Today's arrivals</h2><span class="chip">${d.arrivals.length}</span></header>
            ${d.arrivals.length ? d.arrivals.map(arrivalRow) : empty('No arrivals today', 'New bookings for today appear here.')}</section>
          <section class="panel"><header><h2>Due out today</h2><span class="chip">${d.departures.length}</span></header>
            ${d.departures.length ? d.departures.map((a) => html`<div class="arrival">
              <div class="avatar">${initials(a.guest_name)}</div>
              <div class="who"><b>${a.guest_name}</b><span>Room ${rm(a)}, checked in ${fdate(a.check_in)}</span></div>
              <div class="end">${a.balance > 0 ? html`<span class="chip st-confirmed">Bill so far ${kes(a.bill)}</span>` : html`<span class="chip st-paid">Settled</span>`}
                ${can(...FRONT) ? html`<button class="btn sm" data-act="checkout" data-id="${a.id}">Check out</button>` : ''}</div></div>`) : empty('Nobody is due out', 'Guests whose stay ends today appear here.')}</section>
        </div>
        <div class="stack">
          <section class="panel"><header><h3>Rooms free tonight</h3></header><div class="body avail">
            ${d.availability.map((t) => html`<div><div class="top"><b>${t.type}</b><span>${t.free} free of ${t.total - t.outOfService}</span></div>
              <div class="bar" role="img" aria-label="${t.busy} in use, ${t.outOfService} out of service">
                <i class="b-busy" style="width:${(t.busy / t.total) * 100}%"></i><i class="b-oos" style="width:${(t.outOfService / t.total) * 100}%"></i></div></div>`)}
          </div></section>
          <section class="panel"><header><h3>Guests in house</h3></header><div class="body"><div class="split">
            <div><b>${d.inHouse.total}</b><span>Total guests</span></div><div><b>${d.inHouse.research}</b><span>Research</span></div>
            <div><b style="color:var(--roof)">${d.inHouse.vip}</b><span>VIP and protocol</span></div><div><b>${d.inHouse.seminar}</b><span>Seminar</span></div></div></div></section>
          <section class="panel"><header><h3>Events</h3><a class="small" href="#/events">See all</a></header>
            ${d.events.length ? d.events.map((e) => html`<div class="event"><b>${e.name}</b>
              <span class="small muted">${fdate(e.start_date)} to ${fdate(e.end_date)}, ${e.participants} participants</span>
              ${e.day ? html`<div class="progress"><i style="width:${(e.day / e.total_days) * 100}%"></i></div><span class="small muted">Day ${e.day} of ${e.total_days}</span>`
                : html`<div class="progress"></div><span class="small muted">Starts in ${e.starts_in} day${e.starts_in === 1 ? '' : 's'}</span>`}</div>`) : empty('No events planned', 'Seminars and workshops show up here.')}</section>
          <section class="panel"><header><h3>Recent activity</h3></header>
            <ul class="feed">${d.activity.map((a) => html`<li><div>${a.user_name}: ${a.detail || a.action}<span class="t">${fdt(a.at)}</span></div></li>`)}</ul></section>
        </div>
      </div>`);
  },
};
const rooms = (d, rr) => rr.rooms;

ACTIONS.checkin = async ({ id }) => { await post(`/bookings/${id}/checkin`); toast('Guest checked in'); closeModal(); refresh(); };
ACTIONS.checkout = async ({ id }) => {
  const b = await get(`/bookings/${id}`);
  const inv = b.invoice_id ? await get(`/invoices/${b.invoice_id}`) : null;
  const early = todayISO() < b.check_out;
  openModal(`Check out ${b.guest_name}`, html`
    <dl class="dl"><dt>Room</dt><dd>${rm(b)}</dd><dt>Stay</dt><dd>${fdate(b.check_in)} to ${fdate(b.check_out)}${early ? html` <span class="chip st-pending">Leaving early, bill is cut to nights stayed</span>` : ''}</dd></dl>
    ${inv ? html`<div class="table-wrap" style="border:1px solid var(--line);border-radius:8px"><table><tbody>
      ${inv.items.map((it) => html`<tr><td>${it.description}</td><td class="num">${num(it.qty * it.unit_price)}</td></tr>`)}</tbody></table></div>
      <div class="totals"><div><span>Bill so far</span><span>${kes(inv.total)}</span></div><div><span>Paid</span><span>${kes(inv.paid)}</span></div>
        <div class="big"><span>Balance</span><span style="color:${inv.balance > 0 ? 'var(--roof)' : 'var(--leaf)'}">${kes(inv.balance)}</span></div></div>
      ${inv.balance > 0 ? html`<div class="notice">Guests usually pay at the end of the stay. Take payment now, or check out and collect it later under Billing.</div>` : ''}` : ''}`,
    { footer: html`<footer><button type="button" class="btn" data-act="close-modal">Cancel</button>
      <button type="button" class="btn ${inv && inv.balance > 0 ? '' : 'primary'}" data-act="co-later" data-id="${id}">${inv && inv.balance > 0 ? 'Check out, pay later' : 'Check out'}</button>
      ${inv && inv.balance > 0 ? html`<button type="button" class="btn primary" data-act="co-pay" data-id="${id}">Check out and take payment</button>` : ''}</footer>` });
};
ACTIONS['co-later'] = async ({ id }) => { await post(`/bookings/${id}/checkout`); closeModal(); toast('Guest checked out'); refresh(); };
ACTIONS['co-pay'] = async ({ id }) => {
  const b = await post(`/bookings/${id}/checkout`);
  closeModal(); toast('Guest checked out'); refresh();
  if (b.invoice && b.invoice.balance > 0) ACTIONS['add-payment']({ id: b.invoice_id, bal: b.invoice.balance });
};

/* ---------------- rooms & inventory ---------------- */
const roomUI = { state: 'all', type: 'all', from: '', to: '' };
PAGES.rooms = {
  roles: ALL,
  async render(host) {
    const ranged = roomUI.from && roomUI.to && roomUI.to > roomUI.from;
    const { rooms: all } = await get('/rooms' + (ranged ? qs({ from: roomUI.from, to: roomUI.to }) : ''));
    ROOMS_CACHE = all;
    const count = (st) => all.filter((r) => r.state === st).length;
    const visible = (r) => (roomUI.state === 'all' || r.state === roomUI.state) && (roomUI.type === 'all' || r.type === roomUI.type);
    mount(host, html`
      ${pageHead('Rooms & inventory', all.length ? `${all.length} rooms in the rooms block. ${count('vacant')} vacant, ${count('occupied')} occupied, ${count('reserved')} reserved, ${count('maintenance') + count('blocked')} out of service.` : 'No rooms yet. Add your rooms to get started.',
        can(...BOSS) ? html`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="bulk-rooms">Add many rooms</button><button class="btn primary" data-act="new-room">${icon('plus', 16)} Add room</button></div>` : '')}
      ${all.length ? '' : html`<section class="panel">${empty('No rooms set up', can(...BOSS) ? 'Use "Add room" for one room, or "Add many rooms" to paste a list from Excel.' : 'Ask a manager to add the rooms.')}</section>`}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Filter by state">${[['all', 'All'], ['vacant', 'Vacant'], ['occupied', 'Occupied'], ['reserved', 'Reserved'], ['maintenance', 'Maintenance'], ['blocked', 'Blocked']]
          .map(([k, l]) => html`<button type="button" class="${roomUI.state === k ? 'on' : ''}" data-act="room-filter" data-k="state" data-v="${k}">${l}</button>`)}</div>
        <label class="field"><span>Room type</span><select id="f-type" data-change="room-type">
          ${['all', ...[...new Set(all.map((r) => r.type))]].map((t) => html`<option value="${t}" ${roomUI.type === t ? 'selected' : ''}>${t === 'all' ? 'All types' : t}</option>`)}</select></label>
        <label class="field"><span>Free from</span><input type="date" id="f-from" value="${roomUI.from}"></label>
        <label class="field"><span>Free until</span><input type="date" id="f-to" value="${roomUI.to}"></label>
        <button class="btn" data-act="room-range">Check availability</button>
        ${ranged ? html`<button class="btn" data-act="room-range-clear">Clear dates</button>` : ''}
      </div>
      ${ranged ? html`<div class="notice ok" style="margin-bottom:14px">${all.filter((r) => r.free_for_range && visible(r)).length} rooms match and are free from ${fdate(roomUI.from)} to ${fdate(roomUI.to)} (outlined in green).</div>` : ''}
      <section class="panel">${buildingMap(all, { wide: true, dimUnless: (r) => visible(r), highlight: ranged ? (r) => r.free_for_range && visible(r) : null })}</section>`);
    const t = $('#f-type'); if (t) t.addEventListener('change', () => { roomUI.type = t.value; refresh(); });
  },
};
ACTIONS['room-filter'] = ({ k, v }) => { roomUI[k] = v; refresh(); };
ACTIONS['room-range'] = () => { roomUI.from = $('#f-from').value; roomUI.to = $('#f-to').value; if (!(roomUI.from && roomUI.to && roomUI.to > roomUI.from)) { toast('Choose a start date and a later end date', true); return; } refresh(); };
ACTIONS['room-range-clear'] = () => { roomUI.from = roomUI.to = ''; refresh(); };

const typeDatalist = () => html`<datalist id="room-types">${[...new Set(ROOMS_CACHE.map((r) => r.type))].map((t) => html`<option value="${t}">`)}</datalist>`;
const roomFields = (r) => html`
  <div class="row">
    ${field('Room number', html`<input type="text" name="number" required maxlength="12" value="${r ? r.number : ''}" placeholder="For example 21">`)}
    ${field('Room name', html`<input type="text" name="name" maxlength="40" value="${r ? r.name || '' : ''}" placeholder="For example Villosa">`)}
    ${field('Room type', html`<input type="text" name="type" list="room-types" required maxlength="40" value="${r ? r.type : ''}" placeholder="Single, Executive, Double...">${typeDatalist()}`)}</div>
  <div class="row">
    ${field('Rate per night (KES)', html`<input type="number" name="rate" min="0" step="50" required value="${r ? r.rate : ''}">`)}
    ${field('Rate for 2 guests (KES)', html`<input type="number" name="rate_double" min="0" step="50" value="${r && r.rate_double ? r.rate_double : ''}" placeholder="Only for double rooms">`)}
    ${field('Guests it sleeps', html`<input type="number" name="max_guests" min="1" max="10" required value="${r ? r.max_guests : 1}">`)}</div>
  <div class="row">
    ${field('Beds', html`<input type="text" name="beds" maxlength="60" value="${r ? r.beds || '' : ''}" placeholder="5x6 bed, 6x6 bed...">`)}
    ${field('View', html`<input type="text" name="view" maxlength="60" value="${r ? r.view || '' : ''}" placeholder="Garden, courtyard, farm...">`)}
    ${field('Floor (0 = ground)', html`<input type="number" name="floor" min="0" max="30" value="${r ? r.floor : 1}" required>`)}</div>`;
// Picking a type that already exists fills in its usual beds, rates and guest limit (only while the rate is still empty).
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || t.name !== 'type' || !t.form || !t.form.rate || Number(t.form.rate.value) > 0) return;
  const same = ROOMS_CACHE.find((x) => x.type.toLowerCase() === t.value.trim().toLowerCase() && x.rate > 0);
  if (!same) return;
  t.form.rate.value = same.rate;
  if (t.form.rate_double) t.form.rate_double.value = same.rate_double || '';
  if (t.form.max_guests) t.form.max_guests.value = same.max_guests;
  if (t.form.beds && !t.form.beds.value) t.form.beds.value = same.beds || '';
});

ACTIONS['new-room'] = () => openModal('Add a room', roomFields(null), {
  submit: 'Add room',
  onSubmit: async (fd) => { await post('/rooms', Object.fromEntries(fd.entries())); closeModal(); toast(`Room ${fd.get('number')} added`); refresh(); },
});

// Paste rows straight from Excel: number, type, floor, beds, view, rate, name, rate for 2, max guests (tabs or commas)
function parseRoomRows(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map((c) => c.trim());
    if (rows.length === 0 && i === 0 && cells[5] !== undefined && isNaN(Number(cells[5].replace(/[, ]/g, '')))) return; // header row
    const [number, type, floor, beds, view, rate, name, rate_double, max_guests] = cells;
    const clean = (v) => String(v ?? '').replace(/[, ]/g, '');
    rows.push({ line: i + 1, number, type, floor: floor === '' || floor === undefined ? 1 : floor, beds, view, rate: clean(rate),
      name: name || '', rate_double: clean(rate_double), max_guests: clean(max_guests) || (clean(rate_double) ? 2 : 1) });
  });
  return rows;
}
ACTIONS['bulk-rooms'] = () => openModal('Add many rooms', html`
  <div class="notice">Paste one room per line with these columns, in this order:<br><b>Room number, Type, Floor, Beds, View, Rate per night, Name, Rate for 2 guests, Guests it sleeps</b><br>
    The last three are optional. You can copy the rows straight from Excel. Examples:<br><code>01, Single, 1, 5x6 bed, , 1800, Zebu</code><br><code>13, Double, 1, Double bed, , 1800, Saanen, 3000, 2</code></div>
  <label class="field"><span>Your rooms</span><textarea name="rows" rows="10" required style="font-family:monospace" placeholder="01, Single, 1, 5x6 bed, , 1800, Zebu&#10;04, Executive, 1, 6x6 bed, , 2000, Boran&#10;13, Double, 1, Double bed, , 1800, Saanen, 3000, 2"></textarea></label>`,
  { wide: true, submit: 'Add rooms',
    onSubmit: async (fd) => {
      const r = await post('/rooms/bulk', { rooms: parseRoomRows(fd.get('rows')) });
      closeModal(); toast(`${r.added} rooms added`); refresh();
    } });

ACTIONS.room = ({ id }) => {
  const r = ROOMS_CACHE.find((x) => String(x.id) === String(id));
  if (!r) return;
  const boss = can(...BOSS);
  const stay = r.current;
  openModal(`Room ${rm(r)}`, html`
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chip cat">${r.type}</span><span class="chip st-${r.state === 'occupied' ? 'checked_in' : r.state === 'reserved' ? 'pending' : r.state === 'vacant' ? 'paid' : 'cancelled'}">${r.state[0].toUpperCase() + r.state.slice(1)}</span>${r.departing_today ? html`<span class="chip st-unpaid">Due out today</span>` : ''}</div>
    <dl class="dl"><dt>Floor and view</dt><dd>${r.floor === 0 ? 'Ground floor' : `Floor ${r.floor}`}, ${r.view || 'no view listed'}</dd><dt>Beds</dt><dd>${r.beds || 'Not listed'}</dd>
      <dt>Rate per night</dt><dd>${kes(r.rate)}${r.rate_double ? html` for one guest, ${kes(r.rate_double)} for two` : ''}<br><span class="muted small">Includes breakfast. Sleeps ${r.max_guests}.</span></dd>
      ${stay ? html`<dt>Current guest</dt><dd>${stay.guest_name}<br><span class="muted small">${fdate(stay.check_in)} to ${fdate(stay.check_out)}, ${stay.ref}</span></dd>` : ''}
      ${r.next ? html`<dt>Next booking</dt><dd>${r.next.guest_name}<br><span class="muted small">${fdate(r.next.check_in)} to ${fdate(r.next.check_out)}, ${r.next.ref}</span></dd>` : ''}
      ${r.status !== 'active' ? html`<dt>Reason</dt><dd>${r.status_note || 'Not recorded'}</dd>` : ''}</dl>
    ${boss ? html`<hr style="border:0;border-top:1px solid var(--line);width:100%">
      <h3>Edit this room</h3>${roomFields(r)}
      <div class="row">
        ${field('Room status', html`<select name="status">${['active', 'maintenance', 'blocked'].map((s) => html`<option value="${s}" ${r.status === s ? 'selected' : ''}>${s === 'active' ? 'In service' : s[0].toUpperCase() + s.slice(1)}</option>`)}</select>`)}
        ${field('Note (why out of service)', html`<input type="text" name="status_note" maxlength="200" value="${r.status_note || ''}" placeholder="For example: plumbing repair">`)}</div>` : ''}`,
    { footer: html`<footer><button type="button" class="btn" data-act="close-modal">Close</button>
        ${boss ? html`<button type="button" class="btn danger" data-act="delete-room" data-id="${r.id}">Delete room</button>` : ''}
        ${can(...FRONT) && r.status === 'active' ? html`<button type="button" class="btn" data-act="new-booking" data-room="${r.id}">Book this room</button>` : ''}
        ${boss ? html`<button type="submit" class="btn primary">Save changes</button>` : ''}</footer>`,
      onSubmit: boss ? async (fd) => {
        await patch(`/rooms/${r.id}`, Object.fromEntries(fd.entries()));
        closeModal(); toast(`Room ${fd.get('number')} updated`); refresh();
      } : null });
};
ACTIONS['delete-room'] = ({ id }) => {
  const r = ROOMS_CACHE.find((x) => String(x.id) === String(id));
  confirmBox(`Delete room ${rm(r)}?`, 'This removes the room from the system. A room that has ever had a booking cannot be deleted; set it to Blocked instead.', 'Delete room',
    async () => { await del(`/rooms/${id}`); toast(`Room ${r.number} deleted`); refresh(); }, true);
};
