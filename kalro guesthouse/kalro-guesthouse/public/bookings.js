'use strict';
const bkUI = { q: '', status: '', from: '', to: '' };
const CATEGORIES = ['Research', 'Seminar', 'Delegation', 'Training', 'VIP', 'Other'];
const BK_STATUSES = [['', 'All statuses'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['checked_in', 'Checked in'], ['checked_out', 'Checked out'], ['cancelled', 'Cancelled'], ['no_show', 'No-show']];

PAGES.bookings = {
  roles: ALL,
  async render(host) {
    mount(host, html`
      ${pageHead('Bookings', 'Search, filter and manage every room booking.', can(...FRONT) ? html`<button class="btn primary" data-act="new-booking">${icon('plus', 16)} New booking</button>` : '')}
      <div class="toolbar">
        <label class="field grow"><span>Search</span><input type="search" id="bk-q" value="${bkUI.q}" placeholder="Guest, organisation, reference or room number"></label>
        <label class="field"><span>Status</span><select id="bk-status">${BK_STATUSES.map(([v, l]) => html`<option value="${v}" ${bkUI.status === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field"><span>Stay from</span><input type="date" id="bk-from" value="${bkUI.from}"></label>
        <label class="field"><span>Stay until</span><input type="date" id="bk-to" value="${bkUI.to}"></label>
        <button class="btn" data-act="bk-clear">Clear</button>
      </div>
      <section class="panel"><div class="table-wrap" id="bk-table"><div class="empty">Loading…</div></div></section>`);
    let timer;
    $('#bk-q').addEventListener('input', (e) => { bkUI.q = e.target.value; clearTimeout(timer); timer = setTimeout(loadBookings, 250); });
    [['bk-status', 'status'], ['bk-from', 'from'], ['bk-to', 'to']].forEach(([id, k]) => $('#' + id).addEventListener('change', (e) => { bkUI[k] = e.target.value; loadBookings(); }));
    await loadBookings();
  },
};
ACTIONS['bk-clear'] = () => { Object.assign(bkUI, { q: '', status: '', from: '', to: '' }); refresh(); };

async function loadBookings() {
  const box = $('#bk-table'); if (!box) return;
  const rows = await get('/bookings' + qs(bkUI));
  mount(box, rows.length ? html`<table>
    <thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th class="num">Guests</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>${rows.map((b) => html`<tr class="click" data-act="booking" data-id="${b.id}">
      <td><b>${b.guest_name}</b><span class="sub">${b.organisation || 'No organisation'}, ${b.ref}</span></td>
      <td>${rm(b)}<span class="sub">${b.room_type}</span></td>
      <td class="nowrap">${fdate(b.check_in)} to ${fdate(b.check_out)}<span class="sub">${b.nights} night${b.nights === 1 ? '' : 's'}</span></td>
      <td class="num">${b.pax}</td>
      <td><span class="chip cat">${b.category}</span>${b.vip_level ? html` <span class="chip vip">${b.vip_level}</span>` : ''}</td>
      <td>${chip(b.status)}</td></tr>`)}</tbody></table>`
    : empty('No bookings found', 'Try a different search or clear the filters.'));
}

/* ---------------- booking detail ---------------- */
ACTIONS.booking = async ({ id }) => {
  const b = await get(`/bookings/${id}`);
  const front = can(...FRONT);
  const live = ['pending', 'confirmed', 'checked_in'].includes(b.status);
  openModal(`${b.ref}`, html`
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${chip(b.status)}<span class="chip cat">${b.category}</span>${b.vip_level ? html`<span class="chip vip">VIP, ${b.vip_level}</span>` : ''}</div>
    <dl class="dl">
      <dt>Guest</dt><dd>${b.guest_name}${b.organisation ? html`<br><span class="muted small">${b.organisation}</span>` : ''}${b.phone ? html`<br><span class="muted small">${b.phone}</span>` : ''}</dd>
      <dt>Room</dt><dd>${rm(b)}, ${b.room_type}${b.room_view ? `, ${b.room_view}` : ''}</dd>
      <dt>Stay</dt><dd>${fdateY(b.check_in)} to ${fdateY(b.check_out)} (${b.nights} night${b.nights === 1 ? '' : 's'})${b.eta ? `, arriving about ${b.eta}` : ''}</dd>
      <dt>Guests</dt><dd>${b.pax}</dd>
      <dt>Meals</dt><dd>${b.dinner ? `Bed, breakfast and dinner (${kes(b.dinner_total)} dinner for the stay)` : 'Bed and breakfast'}</dd>
      <dt>Rate</dt><dd>${kes(b.rate)} per night (breakfast included), ${kes(b.rate * b.nights)} room charge for the stay</dd>
      ${b.purpose ? html`<dt>Purpose</dt><dd>${b.purpose}</dd>` : ''}
      ${b.event_name ? html`<dt>Event</dt><dd>${b.event_name}</dd>` : ''}
      ${b.notes ? html`<dt>Notes</dt><dd>${b.notes}</dd>` : ''}
      ${b.checked_in_at ? html`<dt>Checked in</dt><dd>${fdt(b.checked_in_at)}</dd>` : ''}
      ${b.checked_out_at ? html`<dt>Checked out</dt><dd>${fdt(b.checked_out_at)}</dd>` : ''}
      ${b.invoice ? html`<dt>Invoice</dt><dd>${chip(b.invoice.status)} ${kes(b.invoice.total)} billed, ${kes(b.invoice.balance)} balance</dd>` : ''}
    </dl>`,
    { footer: html`<footer>
      <button type="button" class="btn" data-act="close-modal">Close</button>
      ${b.invoice_id ? html`<button type="button" class="btn" data-act="invoice" data-id="${b.invoice_id}">View invoice</button>` : ''}
      ${front && live ? html`<button type="button" class="btn" data-act="edit-booking" data-id="${b.id}">Edit</button>` : ''}
      ${front && ['pending', 'confirmed'].includes(b.status) ? html`<button type="button" class="btn danger" data-act="cancel-booking" data-id="${b.id}">Cancel booking</button>` : ''}
      ${front && ['pending', 'confirmed'].includes(b.status) && b.check_in < todayISO() ? html`<button type="button" class="btn danger" data-act="noshow-booking" data-id="${b.id}">Mark no-show</button>` : ''}
      ${front && b.status === 'pending' ? html`<button type="button" class="btn" data-act="confirm-booking" data-id="${b.id}">Confirm</button>` : ''}
      ${front && ['pending', 'confirmed'].includes(b.status) ? html`<button type="button" class="btn primary" data-act="checkin" data-id="${b.id}">Check in</button>` : ''}
      ${front && b.status === 'checked_in' ? html`<button type="button" class="btn primary" data-act="checkout" data-id="${b.id}">Check out</button>` : ''}
    </footer>` });
};
ACTIONS['confirm-booking'] = async ({ id }) => { await post(`/bookings/${id}/confirm`); closeModal(); toast('Booking confirmed'); refresh(); };
ACTIONS['cancel-booking'] = ({ id }) => confirmBox('Cancel this booking?', 'The room becomes free for other guests. This cannot be undone.', 'Cancel booking',
  async () => { await post(`/bookings/${id}/cancel`); toast('Booking cancelled'); refresh(); }, true);
ACTIONS['noshow-booking'] = ({ id }) => confirmBox('Mark as no-show?', 'The guest did not arrive. The room becomes free.', 'Mark no-show',
  async () => { await post(`/bookings/${id}/noshow`); toast('Marked as no-show'); refresh(); }, true);
ACTIONS['edit-booking'] = async ({ id }) => bookingForm({ booking: await get(`/bookings/${id}`) });
ACTIONS['new-booking'] = ({ room, event }) => bookingForm({ room_id: room ? Number(room) : null, event_id: event ? Number(event) : null });

/* ---------------- booking form (new + edit) ---------------- */
async function bookingForm(o = {}) {
  const b = o.booking || null;
  const boss = can(...BOSS);
  const T = todayISO();
  const events = (await get('/events')).filter((e) => e.phase === 'active' || e.phase === 'upcoming' || (b && e.id === b.event_id));
  const ci = b ? b.check_in : o.check_in || T;
  const co = b ? b.check_out : o.check_out || addDays(ci, 1);
  const locked = b && b.status === 'checked_in';
  const minDate = boss ? '' : T;
  const DINNER = (await get('/settings')).dinner_rate;

  const form = openModal(b ? `Edit ${b.ref}` : 'New booking', html`
    ${b ? html`<dl class="dl"><dt>Guest</dt><dd>${b.guest_name}${b.organisation ? `, ${b.organisation}` : ''}</dd></dl>` : html`
      <div class="field" style="position:relative"><span>Guest name</span>
        <input type="text" name="guest_name" autocomplete="off" required maxlength="120" placeholder="Start typing to find a returning guest">
        <input type="hidden" name="guest_id"><div class="suggest hidden" id="g-suggest"></div></div>
      <div class="row">${field('Organisation', html`<input type="text" name="organisation" maxlength="120" placeholder="Institute, ministry or company">`)}
        ${field('Phone', html`<input type="text" name="phone" maxlength="40" placeholder="+254 ...">`)}</div>`}
    <div class="row">
      ${field('Check-in', html`<input type="date" name="check_in" value="${ci}" ${minDate ? html`min="${minDate}"` : ''} ${locked ? 'disabled' : ''} required>`)}
      ${field('Check-out', html`<input type="date" name="check_out" value="${co}" min="${addDays(ci, 1)}" required>`)}
      <div class="field"><span>Length of stay</span><div id="nights" style="padding:9px 0;font-weight:700"></div></div></div>
    <div class="field"><span>Room (only rooms free for these dates are listed)</span><div class="picker" id="room-picker"><div class="empty">Loading rooms…</div></div></div>
    <div class="row">
      ${field('Number of guests', html`<input type="number" name="pax" min="1" max="20" value="${b ? b.pax : 1}" required>`)}
      ${field('Meals', html`<select name="dinner"><option value="0" ${b && b.dinner ? '' : 'selected'}>Bed &amp; breakfast</option><option value="1" ${b && b.dinner ? 'selected' : ''}>+ Dinner (${kes(DINNER)} each)</option></select>`)}
      ${field('Booking type', html`<select name="category">${CATEGORIES.map((c) => html`<option ${(b ? b.category : 'Other') === c ? 'selected' : ''}>${c}</option>`)}</select>`)}
      ${field('VIP protocol', html`<select name="vip_level"><option value="">None</option>${['Protocol 1', 'Protocol 2', 'Protocol 3'].map((p) => html`<option ${b && b.vip_level === p ? 'selected' : ''}>${p}</option>`)}</select>`)}
      ${field('Expected arrival', html`<input type="time" name="eta" value="${b ? b.eta || '' : ''}">`)}</div>
    <div class="row">
      ${field('Purpose of visit', html`<input type="text" name="purpose" maxlength="200" value="${b ? b.purpose || '' : ''}" placeholder="For example: Field research">`)}
      ${field('Linked event or seminar', html`<select name="event_id"><option value="">None</option>${events.map((e) => html`<option value="${e.id}" ${(b ? b.event_id : o.event_id) === e.id ? 'selected' : ''}>${e.name}</option>`)}</select>`)}</div>
    ${boss ? field('Special rate per night (KES), only if different from the standard', html`<input type="number" name="rate" min="0" step="50" value="" placeholder="${b ? 'Leave empty to keep the current rate' : 'Leave empty to use the standard rate'}">`) : ''}
    ${field('Notes', html`<textarea name="notes" maxlength="500" placeholder="Dietary needs, protocol, transport...">${b ? b.notes || '' : ''}</textarea>`)}
    <div class="muted small" id="pax-warn" style="color:var(--red,#b3261e);font-weight:600"></div>
    <div class="notice" id="est" style="display:flex;justify-content:space-between"><span id="est-l">Estimated room charge</span><b id="est-v">Select a room</b></div>
    ${b ? '' : html`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="hold"> Hold as pending (not yet confirmed by the guest)</label>`}`,
  { wide: true, submit: b ? 'Save changes' : 'Create booking', noFocus: false,
    onSubmit: async (fd) => {
      const f = form.elements;
      const payload = {
        check_in: locked ? b.check_in : f.check_in.value, check_out: f.check_out.value,
        room_id: fd.get('room_id'), pax: fd.get('pax'), category: fd.get('category'), vip_level: fd.get('vip_level'),
        eta: fd.get('eta'), dinner: fd.get('dinner'), purpose: fd.get('purpose'), event_id: fd.get('event_id'), notes: fd.get('notes'),
      };
      if (boss && String(fd.get('rate') || '').trim() !== '') payload.rate = fd.get('rate');
      if (!payload.room_id) throw new Error('Choose a room from the list.');
      let res;
      if (b) res = await patch(`/bookings/${b.id}`, payload);
      else {
        if (fd.get('guest_id')) payload.guest_id = fd.get('guest_id');
        else payload.guest = { name: fd.get('guest_name'), organisation: fd.get('organisation'), phone: fd.get('phone') };
        if (fd.get('hold')) payload.status = 'pending';
        res = await post('/bookings', payload);
      }
      closeModal(); toast(b ? 'Booking updated' : `Booking ${res.ref} created`); refresh();
    },
    onMount: (frm) => {
      const f = frm.elements;
      const update = () => {
        const n = f.check_in.value && f.check_out.value ? nightsBetween(f.check_in.value, f.check_out.value) : 0;
        $('#nights', frm).textContent = n > 0 ? `${n} night${n === 1 ? '' : 's'}` : 'Check the dates';
        const sel = $('input[name=room_id]:checked', frm);
        const pax = Number(f.pax.value) || 1;
        if (sel) f.pax.max = sel.dataset.max;
        const std = sel ? (sel.dataset.rate2 && pax >= 2 ? Number(sel.dataset.rate2) : Number(sel.dataset.rate)) : 0;
        const rate = boss && f.rate && f.rate.value ? Number(f.rate.value) : std;
        const dinner = f.dinner.value === '1' ? pax * n * DINNER : 0;
        $('#est-v', frm).textContent = !sel || n <= 0 ? 'Select a room'
          : `${kes(rate * n + dinner)} (${n} × ${kes(rate)}${dinner ? ` + dinner ${kes(dinner)}` : ''})`;
        $('#est-l', frm).textContent = f.dinner.value === '1' ? 'Estimated room and dinner charge' : 'Estimated room charge (breakfast included)';
        $('#pax-warn', frm).textContent = sel && pax > Number(sel.dataset.max) ? `Room ${sel.dataset.label} takes ${sel.dataset.max} guest${sel.dataset.max === '1' ? '' : 's'}.` : '';
      };
      const loadRooms = async () => {
        const box = $('#room-picker', frm);
        const a = f.check_in.disabled ? b.check_in : f.check_in.value, z = f.check_out.value;
        if (!a || !z || z <= a) { mount(box, empty('Choose valid dates', 'Check-out must be after check-in.')); update(); return; }
        f.check_out.min = addDays(a, 1);
        const keep = $('input[name=room_id]:checked', frm)?.value || (b ? String(b.room_id) : o.room_id ? String(o.room_id) : '');
        const { rooms } = await get('/rooms' + qs({ from: a, to: z }));
        const list = rooms.filter((r) => r.free_for_range || (b && r.id === b.room_id));
        if (!list.length) { mount(box, empty('No rooms free', 'Try different dates.')); update(); return; }
        const top = {}; list.forEach((r) => { top[r.type] = Math.max(top[r.type] || 0, r.rate); });
        const types = Object.keys(top).sort((x, y) => top[y] - top[x] || x.localeCompare(y));
        mount(box, types.filter((t) => list.some((r) => r.type === t)).map((t) => html`<div class="grp">${t}</div>${list.filter((r) => r.type === t).map((r) => html`
          <label><input type="radio" name="room_id" value="${r.id}" data-rate="${r.rate}" data-rate2="${r.rate_double || ''}" data-max="${r.max_guests}" data-label="${rm(r)}" ${String(r.id) === keep ? 'checked' : ''}>
            <span><b>Room ${rm(r)}</b> <span class="muted small">${[r.beds, r.view].filter(Boolean).join(', ')}${r.max_guests > 1 ? `, sleeps ${r.max_guests}` : ''}</span></span>
            <span style="margin-left:auto">${r.rate_double ? `${kes(r.rate)} (1) / ${kes(r.rate_double)} (2)` : kes(r.rate)}</span></label>`)}`));
        update();
      };
      f.check_in.addEventListener('change', loadRooms);
      f.check_out.addEventListener('change', loadRooms);
      frm.addEventListener('input', (e) => { if (['rate', 'pax'].includes(e.target.name)) update(); });
      frm.addEventListener('change', (e) => { if (['room_id', 'dinner'].includes(e.target.name)) update(); });
      if (!b) {
        const name = f.guest_name, box = $('#g-suggest', frm); let t;
        name.addEventListener('input', () => {
          f.guest_id.value = '';
          clearTimeout(t);
          if (name.value.trim().length < 2) { box.classList.add('hidden'); return; }
          t = setTimeout(async () => {
            const gs = await get('/guests' + qs({ q: name.value.trim() }));
            if (!gs.length) { box.classList.add('hidden'); return; }
            mount(box, gs.map((g) => html`<button type="button" data-act="pick-guest" data-id="${g.id}" data-name="${g.name}" data-org="${g.organisation || ''}" data-phone="${g.phone || ''}">${g.name} <span>${g.organisation || ''}</span></button>`));
            box.classList.remove('hidden');
          }, 250);
        });
      }
      loadRooms();
    } });
}
ACTIONS['pick-guest'] = (d) => {
  const f = CURRENT_MODAL.form.elements;
  f.guest_id.value = d.id; f.guest_name.value = d.name; f.organisation.value = d.org; f.phone.value = d.phone;
  $('#g-suggest').classList.add('hidden');
};
