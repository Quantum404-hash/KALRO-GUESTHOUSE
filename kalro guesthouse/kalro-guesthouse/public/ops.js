'use strict';
/* ---------------- events & seminars ---------------- */
let EVENTS_CACHE = [];
const eventCard = (e) => html`<div class="card click" data-act="event" data-id="${e.id}">
  <div style="display:flex;gap:8px;align-items:start"><h3 style="flex:1">${e.name}</h3>
    ${e.phase === 'active' ? html`<span class="chip st-checked_in">Running</span>` : e.phase === 'upcoming' ? html`<span class="chip st-confirmed">Upcoming</span>` : e.phase === 'cancelled' ? html`<span class="chip st-cancelled">Cancelled</span>` : html`<span class="chip">Finished</span>`}</div>
  <div class="meta"><span>${fdate(e.start_date)} to ${fdate(e.end_date)}</span><span>${e.venue || 'Venue not set'}</span></div>
  ${e.phase === 'active' ? html`<div><div class="progress"><i style="width:${(e.day / e.total_days) * 100}%"></i></div><span class="small muted">Day ${e.day} of ${e.total_days}</span></div>` : ''}
  <div class="meta"><span><b>${e.participants}</b> participants</span><span><b>${e.rooms_booked}</b> rooms booked for ${e.pax_booked} guests</span></div>
  ${e.organiser ? html`<span class="small muted">Organised by ${e.organiser}</span>` : ''}
  ${e.reference ? html`<span class="small muted">Ref: ${e.reference}</span>` : ''}</div>`;

PAGES.events = {
  roles: ALL,
  async render(host) {
    const list = await get('/events');
    EVENTS_CACHE = list;
    const grp = (p) => list.filter((e) => e.phase === p).sort((a, b) => (p === 'past' ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)));
    const sec = (title, arr) => arr.length ? html`<h2 class="section-title">${title}</h2><div class="cards">${arr.map(eventCard)}</div>` : '';
    mount(host, html`
      ${pageHead('Events & seminars', 'Workshops, seminars and trainings. Guesthouse staff add each event here when a request or invoice arrives.', can(...FRONT) ? html`<button class="btn primary" data-act="new-event">${icon('plus', 16)} New event</button>` : '')}
      ${list.length ? html`${sec('Running now', grp('active'))}${sec('Upcoming', grp('upcoming'))}${sec('Finished', grp('past'))}${sec('Cancelled', grp('cancelled'))}`
        : html`<section class="panel">${empty('No events yet', 'When an event request arrives (by email, LPO or invoice), press New event and fill in the details. Then link the guests\' room bookings to it.')}</section>`}`);
  },
};

async function eventForm(e) {
  const { amenities } = await get('/amenities');
  const venues = amenities.filter((a) => a.kind === 'Conference' || a.kind === 'Dining' || a.kind === 'Lounge');
  const T = todayISO();
  openModal(e ? 'Edit event' : 'New event', html`
    ${field('Event name', html`<input type="text" name="name" required maxlength="200" value="${e ? e.name : ''}" placeholder="For example: Dairy Goat Breeding Workshop">`)}
    <div class="row">${field('Starts', html`<input type="date" name="start_date" required value="${e ? e.start_date : T}">`)}
      ${field('Ends', html`<input type="date" name="end_date" required value="${e ? e.end_date : T}">`)}
      ${field('Participants', html`<input type="number" name="participants" min="0" max="2000" value="${e ? e.participants : 0}">`)}</div>
    <div class="row">${field('Venue', html`<input type="text" name="venue" list="venues" maxlength="120" value="${e ? e.venue || '' : ''}"><datalist id="venues">${venues.map((v) => html`<option value="${v.name}">`)}</datalist>`)}
      ${field('Organised by', html`<input type="text" name="organiser" maxlength="120" value="${e ? e.organiser || '' : ''}" placeholder="Unit or department">`)}</div>
    ${field('Reference (email, LPO or invoice number)', html`<input type="text" name="reference" maxlength="100" value="${e ? e.reference || '' : ''}" placeholder="For example: LPO 4521 or the email subject">`)}
    ${field('Notes', html`<textarea name="notes" maxlength="500">${e ? e.notes || '' : ''}</textarea>`)}
    ${e ? field('Status', html`<select name="status">${[['planned', 'Planned'], ['done', 'Finished'], ['cancelled', 'Cancelled']].map(([v, l]) => html`<option value="${v}" ${e.status === v ? 'selected' : ''}>${l}</option>`)}</select>`) : ''}`,
    { submit: e ? 'Save changes' : 'Create event',
      onSubmit: async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (e) await patch(`/events/${e.id}`, body); else await post('/events', body);
        closeModal(); toast(e ? 'Event updated' : 'Event created'); refresh();
      } });
}
ACTIONS['new-event'] = () => eventForm(null);
ACTIONS['edit-event'] = ({ id }) => eventForm(EVENTS_CACHE.find((e) => String(e.id) === String(id)));
ACTIONS.event = async ({ id }) => {
  const e = EVENTS_CACHE.find((x) => String(x.id) === String(id));
  const bks = (await get('/bookings' + qs({ event_id: id }))).filter((b) => !['cancelled', 'no_show'].includes(b.status));
  openModal(e.name, html`
    <dl class="dl"><dt>Dates</dt><dd>${fdateY(e.start_date)} to ${fdateY(e.end_date)} (${e.total_days} day${e.total_days === 1 ? '' : 's'})</dd>
      <dt>Venue</dt><dd>${e.venue || 'Not set'}</dd><dt>Participants</dt><dd>${e.participants}</dd>
      ${e.organiser ? html`<dt>Organised by</dt><dd>${e.organiser}</dd>` : ''}${e.reference ? html`<dt>Reference</dt><dd>${e.reference}</dd>` : ''}${e.notes ? html`<dt>Notes</dt><dd>${e.notes}</dd>` : ''}</dl>
    <div><h3 style="margin-bottom:8px">Rooms booked for this event (${bks.length})</h3>
      ${bks.length ? html`<div class="table-wrap" style="border:1px solid var(--line);border-radius:8px"><table><tbody>${bks.map((b) => html`<tr class="click" data-act="booking" data-id="${b.id}">
        <td><b>${b.guest_name}</b><span class="sub">${b.organisation || ''}</span></td><td>Room ${rm(b)}</td>
        <td class="nowrap">${fdate(b.check_in)} to ${fdate(b.check_out)}</td><td>${chip(b.status)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="muted">No rooms are linked to this event yet.</div>`}</div>`,
    { footer: html`<footer><button type="button" class="btn" data-act="close-modal">Close</button>
      ${can(...FRONT) ? html`<button type="button" class="btn" data-act="edit-event" data-id="${e.id}">Edit event</button>
      <button type="button" class="btn primary" data-act="book-for-event" data-id="${e.id}">Book a room for this event</button>` : ''}</footer>`, wide: true });
};
ACTIONS['book-for-event'] = ({ id }) => {
  const e = EVENTS_CACHE.find((x) => String(x.id) === String(id));
  const ci = e.start_date > todayISO() ? e.start_date : todayISO();
  bookingForm({ event_id: e.id, check_in: ci, check_out: e.end_date > ci ? e.end_date : addDays(ci, 1) });
};

/* ---------------- lounge & amenities ---------------- */
const amUI = { date: todayISO() };
let MEALS = { dinner_rate: 500 };
PAGES.amenities = {
  roles: ALL,
  async render(host) {
    const [{ date, amenities }, meals] = await Promise.all([get('/amenities' + qs({ date: amUI.date })), get('/settings')]);
    window.AMENITIES = amenities; MEALS = meals;
    mount(host, html`
      ${pageHead('Lounge & amenities', 'Conference halls, lounges, dining and guest services. Managers add the venues and set their prices.', can(...BOSS) ? html`<button class="btn primary" data-act="new-amenity">${icon('plus', 16)} Add venue or service</button>` : '')}
      <section class="panel" style="margin-bottom:14px"><header><h3>Meal prices</h3></header>
        <div class="meta" style="padding:0 16px 14px"><span>Breakfast: <b>included in the room price</b></span><span>Dinner: <b>${kes(MEALS.dinner_rate)}</b> per guest per night</span>
          ${can(...BOSS) ? html`<button class="btn sm" data-act="edit-dinner">Change dinner price</button>` : ''}</div></section>
      <div class="toolbar">
        <button class="btn" data-act="am-day" data-d="-1" aria-label="Previous day">Previous day</button>
        <label class="field"><span>Showing reservations for</span><input type="date" id="am-date" value="${date}"></label>
        <button class="btn" data-act="am-day" data-d="1" aria-label="Next day">Next day</button>
        ${date !== todayISO() ? html`<button class="btn" data-act="am-day" data-d="0">Today</button>` : ''}
      </div>
      <div class="cards">${amenities.map((a) => html`<div class="card">
        <div style="display:flex;gap:8px;align-items:start"><h3 style="flex:1">${a.name}</h3><span class="chip cat">${a.kind}</span></div>
        <div class="meta"><span>${a.location}</span>${a.capacity ? html`<span>Holds ${a.capacity}</span>` : ''}<span>${a.rate ? `${kes(a.rate)} ${a.rate_unit}` : 'Price not set'}</span></div>
        <div style="display:grid;gap:6px;margin-top:4px">
          ${a.reservations.length ? a.reservations.map((r) => html`<div class="slot"><b>${r.start_time} to ${r.end_time}</b><span>${r.reserved_for}${r.pax ? `, ${r.pax} people` : ''}</span>
            ${can(...FRONT) ? html`<button class="icon-btn x" data-act="cancel-res" data-id="${r.id}" title="Cancel reservation" aria-label="Cancel reservation">${icon('x', 15)}</button>` : ''}</div>`)
            : html`<span class="small muted">Free all day on ${fdate(date)}</span>`}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          ${can(...FRONT) && a.kind !== 'Service' ? html`<button class="btn sm primary" data-act="reserve" data-id="${a.id}">Reserve</button>` : ''}
          ${can(...BOSS) ? html`<button class="btn sm" data-act="edit-amenity" data-id="${a.id}">Edit</button>
            <button class="btn sm danger" data-act="delete-amenity" data-id="${a.id}">Remove</button>` : ''}</div></div>`)}</div>
      ${amenities.length ? '' : html`<section class="panel">${empty('No venues yet', can(...BOSS) ? 'Press Add venue or service to list the conference hall, dining hall, lounge and so on, with their real prices.' : 'A manager can add the venues and their prices.')}</section>`}`);
    $('#am-date').addEventListener('change', (e) => { if (e.target.value) { amUI.date = e.target.value; refresh(); } });
  },
};
ACTIONS['am-day'] = ({ d }) => { amUI.date = d === '0' ? todayISO() : addDays(amUI.date, Number(d)); refresh(); };
ACTIONS.reserve = async ({ id }) => {
  const a = window.AMENITIES.find((x) => String(x.id) === String(id));
  const events = (await get('/events')).filter((e) => e.phase === 'active' || e.phase === 'upcoming');
  openModal(`Reserve: ${a.name}`, html`
    ${a.capacity ? html`<div class="notice">Holds up to ${a.capacity} people.</div>` : ''}
    ${field('Reserved for', html`<input type="text" name="reserved_for" required maxlength="200" placeholder="Group, unit or person">`)}
    <div class="row">${field('Date', html`<input type="date" name="on_date" value="${amUI.date}" required>`)}
      ${field('From', html`<input type="time" name="start_time" value="09:00" required>`)}
      ${field('Until', html`<input type="time" name="end_time" value="17:00" required>`)}
      ${field('People', html`<input type="number" name="pax" min="1" ${a.capacity ? html`max="${a.capacity}"` : ''}>`)}</div>
    ${field('Linked event', html`<select name="event_id"><option value="">None</option>${events.map((e) => html`<option value="${e.id}">${e.name}</option>`)}</select>`)}`,
    { submit: 'Reserve',
      onSubmit: async (fd) => { await post(`/amenities/${a.id}/reserve`, Object.fromEntries(fd.entries())); closeModal(); toast('Reservation saved'); refresh(); } });
};
ACTIONS['cancel-res'] = ({ id }) => confirmBox('Cancel this reservation?', 'The time slot becomes free again.', 'Cancel reservation',
  async () => { await del(`/reservations/${id}`); toast('Reservation cancelled'); refresh(); }, true);
const AM_KINDS = ['Conference', 'Dining', 'Lounge', 'Service', 'Other'];
const amenityFields = (a) => html`
  <div class="row">${field('Name', html`<input type="text" name="name" required maxlength="80" value="${a ? a.name : ''}" placeholder="For example: Conference hall">`)}
    ${field('Type', html`<select name="kind">${AM_KINDS.map((k) => html`<option ${a && a.kind === k ? 'selected' : ''}>${k}</option>`)}</select>`)}</div>
  <div class="row">${field('Where', html`<input type="text" name="location" maxlength="120" value="${a ? a.location || '' : ''}" placeholder="Building or area">`)}
    ${field('Holds (people)', html`<input type="number" name="capacity" min="1" max="5000" value="${a && a.capacity ? a.capacity : ''}">`)}</div>
  <div class="row">${field('Price (KES, 0 = not set or free)', html`<input type="number" name="rate" min="0" step="100" value="${a ? a.rate : 0}">`)}
    ${field('Charged', html`<input type="text" name="rate_unit" maxlength="40" value="${a ? a.rate_unit : 'per day'}" placeholder="per day, per session, per item">`)}</div>`;
ACTIONS['new-amenity'] = () => openModal('Add a venue or service', amenityFields(null), {
  submit: 'Add', onSubmit: async (fd) => { await post('/amenities', Object.fromEntries(fd.entries())); closeModal(); toast('Added'); refresh(); } });
ACTIONS['edit-amenity'] = ({ id }) => {
  const a = window.AMENITIES.find((x) => String(x.id) === String(id));
  openModal(`Edit ${a.name}`, amenityFields(a), {
    submit: 'Save', onSubmit: async (fd) => { await patch(`/amenities/${a.id}`, Object.fromEntries(fd.entries())); closeModal(); toast('Saved'); refresh(); } });
};
ACTIONS['delete-amenity'] = ({ id }) => {
  const a = window.AMENITIES.find((x) => String(x.id) === String(id));
  confirmBox(`Remove ${a.name}?`, 'It disappears from this list. Past reservations are kept in the records.', 'Remove',
    async () => { await del(`/amenities/${id}`); toast('Removed'); refresh(); }, true);
};
ACTIONS['edit-dinner'] = () => openModal('Dinner price', html`
  <div class="notice">Charged per guest per night. New bookings use this price; invoices already made keep their price.</div>
  ${field('Dinner price (KES)', html`<input type="number" name="dinner_rate" min="0" step="50" value="${MEALS.dinner_rate}" required>`)}`,
  { submit: 'Save price', onSubmit: async (fd) => { await patch('/settings', { dinner_rate: fd.get('dinner_rate') }); closeModal(); toast('Dinner price updated'); refresh(); } });
