const SUPABASE_URL = 'https://vmmyzuauiscukyapudqc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbXl6dWF1aXNjdWt5YXB1ZHFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODg1MzAsImV4cCI6MjA5Mjk2NDUzMH0.2LlpdHhzrYnroUbfDZpTtgjP_j_WpsV4MtR7FWJF6XI';
let db = null;
let userKey = null;
let classes = [];
let exams = [];
let tasks = [];
let csvCourses = [];
let reminderLeadTime = 15;
let lastDeleted = null;
let undoTimeout = null;

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
function showLoader() { document.getElementById('global-loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('global-loader').classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', () => {
    try {
        userKey = localStorage.getItem('classify_user_key');
        const storedTime = localStorage.getItem('reminderLeadTime');
        if (storedTime) reminderLeadTime = parseInt(storedTime);
    } catch (e) { console.warn('localStorage not available', e); }

    setupTheme();
    setupKeyOverlay();
    setupNavigation();
    setupModals();
    setupForms();
    loadProjectCSV();

    if (window.supabase) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        showToast("Error: Supabase client not loaded");
    }

    if (userKey) {
        document.getElementById('key-overlay').classList.add('hidden');
        initApp();
    }
});

function setupKeyOverlay() {
    document.getElementById('tab-new').addEventListener('click', () => switchKeyTab('new'));
    document.getElementById('tab-existing').addEventListener('click', () => switchKeyTab('existing'));
    
    document.getElementById('btn-create-key').addEventListener('click', () => {
        try { userKey = crypto.randomUUID(); } catch(e) { userKey = 'usr_' + Math.random().toString(36).substr(2) + Date.now(); }
        try { localStorage.setItem('classify_user_key', userKey); } catch(e) {}
        switchKeyTab('key-display');
        document.getElementById('generated-key-text').textContent = userKey;
        document.getElementById('settings-key-display').textContent = userKey;
    });

    document.getElementById('btn-use-key').addEventListener('click', () => {
        const inputKey = document.getElementById('existing-key-input').value.trim();
        if (!inputKey || inputKey.length < 10) {
            document.getElementById('key-error').textContent = "Please enter a valid key";
            document.getElementById('key-error').classList.remove('hidden');
            return;
        }
        userKey = inputKey;
        try { localStorage.setItem('classify_user_key', userKey); } catch(e) {}
        document.getElementById('key-overlay').classList.add('hidden');
        initApp();
    });

    const btnImport = document.getElementById('btn-import-key');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            const inputKey = document.getElementById('existing-key-input').value.trim();
            if (!inputKey || inputKey.length < 10) {
                document.getElementById('key-error').textContent = "Please enter a valid key";
                document.getElementById('key-error').classList.remove('hidden');
                return;
            }

            if (!db) {
                document.getElementById('key-error').textContent = "Database connection error.";
                document.getElementById('key-error').classList.remove('hidden');
                return;
            }

            const oldText = btnImport.textContent;
            btnImport.textContent = 'Importing...';
            btnImport.disabled = true;
            document.getElementById('key-error').classList.add('hidden');

            try {
                let newUserKey;
                try { newUserKey = crypto.randomUUID(); } catch(e) { newUserKey = 'usr_' + Math.random().toString(36).substr(2) + Date.now(); }

                const { data: oldClasses } = await db.from('classes').select('*').eq('user_id', inputKey);
                const { data: oldExams } = await db.from('exams').select('*').eq('user_id', inputKey);
                const { data: oldTasks } = await db.from('tasks').select('*').eq('user_id', inputKey);

                if (oldClasses && oldClasses.length > 0) {
                    const newClasses = oldClasses.map(c => {
                        const { id, created_at, ...rest } = c;
                        return { ...rest, user_id: newUserKey };
                    });
                    await db.from('classes').insert(newClasses);
                }

                if (oldExams && oldExams.length > 0) {
                    const newExams = oldExams.map(e => {
                        const { id, created_at, ...rest } = e;
                        return { ...rest, user_id: newUserKey };
                    });
                    await db.from('exams').insert(newExams);
                }

                if (oldTasks && oldTasks.length > 0) {
                    const newTasks = oldTasks.map(t => {
                        const { id, created_at, ...rest } = t;
                        return { ...rest, user_id: newUserKey };
                    });
                    await db.from('tasks').insert(newTasks);
                }

                userKey = newUserKey;
                try { localStorage.setItem('classify_user_key', userKey); } catch(e) {}
                
                alert("Schedule imported successfully!\n\nYour NEW generated key is:\n" + userKey + "\n\nPlease save this key (you can also find it in Settings later).");
                
                document.getElementById('key-overlay').classList.add('hidden');
                initApp();
            } catch (err) {
                console.error(err);
                document.getElementById('key-error').textContent = "Failed to import schedule. Please try again.";
                document.getElementById('key-error').classList.remove('hidden');
            } finally {
                btnImport.textContent = oldText;
                btnImport.disabled = false;
            }
        });
    }

    document.getElementById('btn-copy-key').addEventListener('click', (e) => {
        navigator.clipboard.writeText(userKey);
        e.target.textContent = '✅ Copied!';
        setTimeout(() => e.target.textContent = '📋 Copy Key', 2000);
    });

    document.getElementById('btn-start-app').addEventListener('click', () => {
        document.getElementById('key-overlay').classList.add('hidden');
        initApp();
    });
}

function switchKeyTab(tabName) {
    document.querySelectorAll('.key-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.key-panel').forEach(p => p.classList.remove('active'));
    const t = document.getElementById('tab-' + tabName);
    if(t) t.classList.add('active');
    document.getElementById('panel-' + tabName).classList.add('active');
}async function initApp() {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('settings-key-display').textContent = userKey;
    showLoader();
    await fetchClasses();
    await fetchExams();
    await fetchTasks();
    hideLoader();
    updateAllViews();
    setInterval(updateTimers, 1000);
    setInterval(checkReminders, 30000);
    if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
}

async function fetchClasses() {
    if (!db) return;
    try {
        const { data, error } = await db.from('classes').select('*').eq('user_id', userKey);
        if (!error) classes = data || [];
    } catch(e) { console.error(e); }
}

async function fetchExams() {
    if (!db) return;
    try {
        const { data, error } = await db.from('exams').select('*').eq('user_id', userKey);
        if (!error) exams = data || [];
    } catch(e) { console.error(e); }
}

async function fetchTasks() {
    if (!db) return;
    try {
        const { data, error } = await db.from('tasks').select('*').eq('user_id', userKey);
        if (!error) tasks = data || [];
    } catch(e) { console.error(e); }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item:not(.nav-fab)');
    const tabs = document.querySelectorAll('.tab-section');

    navItems.forEach(nav => {
        nav.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            nav.classList.add('active');
            tabs.forEach(t => {
                t.classList.remove('active');
                if(t.id === `tab-${nav.dataset.tab}`) t.classList.add('active');
            });
        });
    });

    const fab = document.getElementById('nav-add');
    const sheetOverlay = document.getElementById('fab-sheet-overlay');
    const sheet = document.getElementById('fab-sheet');
    const toggleSheet = () => {
        sheetOverlay.classList.toggle('hidden');
        sheet.classList.toggle('hidden');
    };
    fab.addEventListener('click', toggleSheet);
    sheetOverlay.addEventListener('click', toggleSheet);
    document.querySelector('.sheet-handle').addEventListener('click', toggleSheet);

    document.getElementById('fab-add-class').addEventListener('click', () => {
        toggleSheet(); document.getElementById('nav-search').click();
        document.getElementById('manual-class-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
    document.getElementById('fab-add-exam').addEventListener('click', () => {
        toggleSheet(); document.getElementById('nav-search').click();
        document.getElementById('manual-exam-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
    document.getElementById('fab-add-task').addEventListener('click', () => {
        toggleSheet(); document.getElementById('nav-search').click();
        document.getElementById('manual-task-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
    document.getElementById('fab-search-add').addEventListener('click', () => {
        toggleSheet(); document.getElementById('nav-search').click();
        document.getElementById('course-search-input').focus();
    });
    document.getElementById('btn-add-class-shortcut').addEventListener('click', () => {
        document.getElementById('nav-search').click();
        document.getElementById('manual-class-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
    document.getElementById('btn-add-exam-shortcut').addEventListener('click', () => {
        document.getElementById('nav-search').click();
        document.getElementById('manual-exam-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
    document.getElementById('btn-add-task-shortcut').addEventListener('click', () => {
        document.getElementById('nav-search').click();
        document.getElementById('manual-task-form-wrap').scrollIntoView({behavior: 'smooth'});
    });
}function setupModals() {
    document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.remove('hidden'));
    document.getElementById('btn-help').addEventListener('click', () => document.getElementById('modal-help').classList.remove('hidden'));
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById(btn.dataset.modal).classList.add('hidden'));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
    });

    document.getElementById('reminder-minutes').value = reminderLeadTime;
    document.getElementById('reminder-minutes').addEventListener('change', (e) => {
        reminderLeadTime = parseInt(e.target.value);
        try { localStorage.setItem('reminderLeadTime', reminderLeadTime); } catch(err) {}
    });

    document.getElementById('btn-copy-settings-key').addEventListener('click', (e) => {
        navigator.clipboard.writeText(userKey);
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 2000);
    });

    document.getElementById('btn-enable-notif').addEventListener('click', () => {
        if ('Notification' in window) Notification.requestPermission().then(p => showToast('Notifications ' + p));
    });

    document.getElementById('btn-clear-all-classes').addEventListener('click', async () => {
        if(confirm("Are you sure you want to delete ALL classes?")) {
            showLoader();
            await db.from('classes').delete().eq('user_id', userKey);
            classes = []; updateAllViews(); hideLoader();
            document.getElementById('modal-settings').classList.add('hidden');
            showToast('All classes cleared');
        }
    });

    document.getElementById('btn-clear-all-exams').addEventListener('click', async () => {
        if(confirm("Are you sure you want to delete ALL exams?")) {
            showLoader();
            await db.from('exams').delete().eq('user_id', userKey);
            exams = []; updateAllViews(); hideLoader();
            document.getElementById('modal-settings').classList.add('hidden');
            showToast('All exams cleared');
        }
    });

    document.getElementById('btn-change-key').addEventListener('click', () => {
        if(confirm("This will log you out. Make sure you've saved your key!")) {
            try { localStorage.removeItem('classify_user_key'); } catch(e){}
            userKey = null;
            classes = [];
            exams = [];
            tasks = [];
            document.getElementById('modal-settings').classList.add('hidden');
            document.getElementById('app').classList.add('hidden');
            document.getElementById('key-overlay').classList.remove('hidden');
            
            // clear inputs
            document.getElementById('existing-key-input').value = '';
            document.getElementById('generated-key-text').textContent = '';
            document.getElementById('settings-key-display').textContent = '';
        }
    });
}function setupForms() {
    document.querySelectorAll('.day-pill').forEach(pill => {
        pill.addEventListener('click', () => pill.classList.toggle('active'));
    });

    document.getElementById('manual-class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const course = document.getElementById('f-course').value;
        const start_time = document.getElementById('f-start').value;
        const end_time = document.getElementById('f-end').value;
        const type = document.getElementById('f-type').value;
        const room = document.getElementById('f-room').value;
        const activeDays = Array.from(document.querySelectorAll('.day-pill.active')).map(p => p.dataset.day);
        
        if (activeDays.length === 0) { showToast('Please select at least one day.'); return; }
        showLoader();
        const inserts = activeDays.map(day => ({ user_id: userKey, course, start_time, end_time, day, type, room }));
        const { data, error } = await db.from('classes').insert(inserts).select();
        
        if (!error) {
            classes.push(...data); updateAllViews();
            document.getElementById('manual-class-form').reset();
            document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
            document.getElementById('nav-schedule').click();
            showToast('Class added!');
        } else { showToast("Error adding class"); }
        hideLoader();
    });

    document.getElementById('manual-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const course = document.getElementById('e-course').value;
        const date = document.getElementById('e-date').value;
        const time = document.getElementById('e-time').value;
        const notes = document.getElementById('e-notes').value;
        
        showLoader();
        const { data, error } = await db.from('exams').insert([{ user_id: userKey, course, date, time, notes }]).select();
        if (!error) {
            exams.push(data[0]); updateAllViews();
            document.getElementById('manual-exam-form').reset();
            document.getElementById('nav-exams').click();
            showToast('Exam added!');
        } else { showToast("Error adding exam"); }
        hideLoader();
    });

    document.getElementById('manual-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('t-title').value;
        const date = document.getElementById('t-date').value;
        const time = document.getElementById('t-time').value;
        
        showLoader();
        const { data, error } = await db.from('tasks').insert([{ user_id: userKey, title, date, time }]).select();
        if (!error) {
            tasks.push(data[0]); updateAllViews();
            document.getElementById('manual-task-form').reset();
            document.getElementById('nav-exams').click();
            showToast('Task added!');
        } else { showToast("Error adding task"); }
        hideLoader();
    });

    document.getElementById('edit-class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-class-id').value;
        const course = document.getElementById('ec-course').value;
        const start_time = document.getElementById('ec-start').value;
        const end_time = document.getElementById('ec-end').value;
        const type = document.getElementById('ec-type').value;
        const room = document.getElementById('ec-room').value;

        showLoader();
        const { data, error } = await db.from('classes').update({ course, start_time, end_time, type, room }).eq('id', id).select();
        if (!error) {
            const idx = classes.findIndex(c => c.id === id);
            if(idx > -1) classes[idx] = data[0];
            updateAllViews(); document.getElementById('modal-edit-class').classList.add('hidden');
            showToast('Class updated');
        }
        hideLoader();
    });

    document.getElementById('edit-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-exam-id').value;
        const course = document.getElementById('ee-course').value;
        const date = document.getElementById('ee-date').value;
        const time = document.getElementById('ee-time').value;
        const notes = document.getElementById('ee-notes').value;

        showLoader();
        const { data, error } = await db.from('exams').update({ course, date, time, notes }).eq('id', id).select();
        if (!error) {
            const idx = exams.findIndex(ex => ex.id === id);
            if(idx > -1) exams[idx] = data[0];
            updateAllViews(); document.getElementById('modal-edit-exam').classList.add('hidden');
            showToast('Exam updated');
        }
        hideLoader();
    });

    document.getElementById('edit-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-task-id').value;
        const title = document.getElementById('et-title').value;
        const date = document.getElementById('et-date').value;
        const time = document.getElementById('et-time').value;

        showLoader();
        const { data, error } = await db.from('tasks').update({ title, date, time }).eq('id', id).select();
        if (!error) {
            const idx = tasks.findIndex(t => t.id === id);
            if(idx > -1) tasks[idx] = data[0];
            updateAllViews(); document.getElementById('modal-edit-task').classList.add('hidden');
            showToast('Task updated');
        }
        hideLoader();
    });

    document.getElementById('btn-undo').addEventListener('click', async () => {
        if (!lastDeleted) return;
        showLoader();
        if (lastDeleted.type === 'class') {
            const { id, ...rest } = lastDeleted.data;
            const { data, error } = await db.from('classes').insert([rest]).select();
            if (!error) classes.splice(lastDeleted.index, 0, data[0]);
        } else if (lastDeleted.type === 'exam') {
            const { id, ...rest } = lastDeleted.data;
            const { data, error } = await db.from('exams').insert([rest]).select();
            if (!error) exams.splice(lastDeleted.index, 0, data[0]);
        } else if (lastDeleted.type === 'task') {
            const { id, ...rest } = lastDeleted.data;
            const { data, error } = await db.from('tasks').insert([rest]).select();
            if (!error) tasks.splice(lastDeleted.index, 0, data[0]);
        }
        updateAllViews(); hideLoader();
        document.getElementById('undo-snackbar').classList.add('hidden');
        lastDeleted = null;
        showToast('Action undone');
    });
}

function updateAllViews() { renderSchedule(); renderExams(); renderTasks(); renderHome(); updateTimers(); }

function convertTo12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minutes} ${ampm}`;
}

function calculateGap(endTime1, startTime2) {
    const [endHour, endMinute] = endTime1.split(':').map(Number);
    const [startHour, startMinute] = startTime2.split(':').map(Number);
    const gapMinutes = (startHour * 60 + startMinute) - (endHour * 60 + endMinute);
    if (gapMinutes <= 0) return null; 
    const hours = Math.floor(gapMinutes / 60);
    const minutes = gapMinutes % 60;
    if (hours === 0) return `${minutes}m gap`;
    return minutes === 0 ? `${hours}h gap` : `${hours}h ${minutes}m gap`;
}

function getNextOccurrenceOfClass(cls, now = new Date()) {
    const todayIdx = now.getDay();
    const classIdx = DAYS_OF_WEEK.indexOf(cls.day);
    let dayDiff = classIdx - todayIdx;
    const [h, m] = cls.start_time.split(':').map(Number);
    const classTimeToday = new Date(now);
    classTimeToday.setHours(h, m, 0, 0);
    if (dayDiff < 0 || (dayDiff === 0 && now > classTimeToday)) dayDiff += 7;
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + dayDiff);
    nextDate.setHours(h, m, 0, 0);
    return nextDate;
}

function formatDuration(diffMs) {
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    let res = [];
    if (days > 0) res.push(`${days}d`);
    if (hours > 0 || days > 0) res.push(`${hours}h`);
    res.push(`${minutes}m`);
    if(days === 0) res.push(`${seconds}s`);
    return res.join(' ');
}

window.editClass = function(id) {
    const cls = classes.find(c => c.id === id);
    if(!cls) return;
    document.getElementById('edit-class-id').value = cls.id;
    document.getElementById('ec-course').value = cls.course;
    document.getElementById('ec-start').value = cls.start_time;
    document.getElementById('ec-end').value = cls.end_time;
    document.getElementById('ec-type').value = cls.type;
    document.getElementById('ec-room').value = cls.room;
    document.getElementById('modal-edit-class').classList.remove('hidden');
};

window.deleteClass = async function(id) {
    if(!confirm("Delete this class?")) return;
    const idx = classes.findIndex(c => c.id === id);
    if(idx === -1) return;
    const deleted = classes[idx];
    classes.splice(idx, 1); updateAllViews();
    const { error } = await db.from('classes').delete().eq('id', id);
    if (!error) showUndo('Class deleted', 'class', deleted, idx);
};

window.editExam = function(id) {
    const ex = exams.find(e => e.id === id);
    if(!ex) return;
    document.getElementById('edit-exam-id').value = ex.id;
    document.getElementById('ee-course').value = ex.course;
    document.getElementById('ee-date').value = ex.date;
    document.getElementById('ee-time').value = ex.time;
    document.getElementById('ee-notes').value = ex.notes || '';
    document.getElementById('modal-edit-exam').classList.remove('hidden');
};

window.deleteExam = async function(id) {
    if(!confirm("Delete this exam?")) return;
    const idx = exams.findIndex(e => e.id === id);
    if(idx === -1) return;
    const deleted = exams[idx];
    exams.splice(idx, 1); updateAllViews();
    const { error } = await db.from('exams').delete().eq('id', id);
    if (!error) showUndo('Exam deleted', 'exam', deleted, idx);
};

window.editTask = function(id) {
    const t = tasks.find(x => x.id === id);
    if(!t) return;
    document.getElementById('edit-task-id').value = t.id;
    document.getElementById('et-title').value = t.title;
    document.getElementById('et-date').value = t.date;
    document.getElementById('et-time').value = t.time;
    document.getElementById('modal-edit-task').classList.remove('hidden');
};

window.deleteTask = async function(id) {
    if(!confirm("Delete this task?")) return;
    const idx = tasks.findIndex(x => x.id === id);
    if(idx === -1) return;
    const deleted = tasks[idx];
    tasks.splice(idx, 1); updateAllViews();
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (!error) showUndo('Task deleted', 'task', deleted, idx);
};

function showUndo(msg, type, data, index) {
    const bar = document.getElementById('undo-snackbar');
    document.getElementById('snackbar-text').textContent = msg;
    bar.classList.remove('hidden');
    lastDeleted = { type, data, index };
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { bar.classList.add('hidden'); lastDeleted = null; }, 5000);
}function renderSchedule() {
    const container = document.getElementById('routine-container');
    if (classes.length === 0) {
        container.innerHTML = `<p class="empty-state full-empty">No classes added yet.<br/>Tap <strong>+</strong> to get started.</p>`;
        return;
    }
    container.innerHTML = '';
    const todayIndex = new Date().getDay();
    const orderedDays = [...DAYS_OF_WEEK.slice(todayIndex), ...DAYS_OF_WEEK.slice(0, todayIndex)];

    orderedDays.forEach(day => {
        const dayClasses = classes.filter(cls => cls.day === day);
        if (dayClasses.length === 0) return;
        dayClasses.sort((a, b) => {
            const [aH, aM] = a.start_time.split(':').map(Number);
            const [bH, bM] = b.start_time.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });

        let html = `
            <div class="day-block">
                <div class="day-block-header">
                    <div class="day-block-title">${day}${day === DAYS_OF_WEEK[todayIndex] ? ' (Today)' : ''}</div>
                </div>
                <div class="day-block-body">`;

        dayClasses.forEach((cls, idx) => {
            if (idx > 0) {
                const gap = calculateGap(dayClasses[idx-1].end_time, cls.start_time);
                if (gap) html += `<div class="gap-row"><span>⏳ ${gap}</span></div>`;
            }
            html += `
                <div class="class-row">
                    <div class="class-type-dot ${cls.type.toLowerCase() === 'lab' ? 'dot-lab' : 'dot-theory'}"></div>
                    <div class="class-row-info">
                        <div class="class-row-name">${cls.course}</div>
                        <div class="class-row-meta">${convertTo12Hour(cls.start_time)} - ${convertTo12Hour(cls.end_time)} | Room: ${cls.room || 'TBA'}</div>
                    </div>
                    <div class="class-row-actions">
                        <button class="btn-edit" onclick="editClass('${cls.id}')">Edit</button>
                        <button class="btn-del" onclick="deleteClass('${cls.id}')">Del</button>
                    </div>
                </div>`;
        });
        html += `</div></div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderExams() {
    const container = document.getElementById('exam-list-container');
    if (exams.length === 0) {
        container.innerHTML = `<p class="empty-state full-empty">No exams scheduled yet.<br/>Tap <strong>+</strong> to add one.</p>`;
        return;
    }
    container.innerHTML = '';
    const now = new Date();
    const sortedExams = [...exams].sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    sortedExams.forEach(exam => {
        const isExpired = new Date(exam.date + 'T' + exam.time) < now;
        const html = `
            <div class="exam-card ${isExpired ? 'expired' : ''}">
                <div class="exam-card-top">
                    <div class="exam-card-course">${exam.course}</div>
                    <div class="exam-card-actions">
                        <button class="btn-edit" onclick="editExam('${exam.id}')">Edit</button>
                        <button class="btn-del" onclick="deleteExam('${exam.id}')">Del</button>
                    </div>
                </div>
                <div class="exam-card-meta">
                    📅 ${new Date(exam.date).toLocaleDateString()} at ${convertTo12Hour(exam.time)}
                </div>
                ${exam.notes ? `<div class="exam-card-notes">Notes: ${exam.notes}</div>` : ''}
                <div class="exam-card-countdown" data-exam-id="${exam.id}">
                    ${isExpired ? 'Exam passed' : 'Calculating...'}
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderTasks() {
    const container = document.getElementById('task-list-container');
    if (!container) return;
    if (tasks.length === 0) {
        container.innerHTML = `<p class="empty-state full-empty" style="padding: 24px 16px;">No tasks yet.<br/>Tap <strong>+ Add Task</strong>.</p>`;
        return;
    }
    container.innerHTML = '';
    const now = new Date();
    const sortedTasks = [...tasks].sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    sortedTasks.forEach(task => {
        const isExpired = new Date(task.date + 'T' + task.time) < now;
        const html = `
            <div class="exam-card ${isExpired ? 'expired' : ''}">
                <div class="exam-card-top">
                    <div class="exam-card-course">${task.title}</div>
                    <div class="exam-card-actions">
                        <button class="btn-edit" onclick="editTask('${task.id}')">Edit</button>
                        <button class="btn-del" onclick="deleteTask('${task.id}')">Del</button>
                    </div>
                </div>
                <div class="exam-card-meta">
                    📅 ${new Date(task.date).toLocaleDateString()} at ${convertTo12Hour(task.time)}
                </div>
                <div class="exam-card-countdown" data-task-id="${task.id}">
                    ${isExpired ? 'Passed' : 'Calculating...'}
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}function renderHome() {
    const now = new Date();
    const todayStr = DAYS_OF_WEEK[now.getDay()];
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    
    let weekClasses = 0, weekClassesDone = 0, upcomingExams = 0;
    classes.forEach(cls => {
        weekClasses++;
        const nextTime = getNextOccurrenceOfClass(cls, weekStart);
        if (nextTime < now && nextTime >= weekStart) weekClassesDone++;
    });
    exams.forEach(ex => {
        if (new Date(ex.date + 'T' + ex.time) > now) upcomingExams++;
    });
    
    document.getElementById('stat-classes-num').textContent = weekClasses;
    document.getElementById('stat-exams-num').textContent = upcomingExams;
    document.getElementById('stat-done-num').textContent = weekClassesDone;

    document.getElementById('today-label').textContent = now.toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'});
    const todayScheduleCont = document.getElementById('today-schedule');
    
    const todayClasses = classes.filter(c => c.day === todayStr).sort((a, b) => {
        const [aH, aM] = a.start_time.split(':').map(Number);
        const [bH, bM] = b.start_time.split(':').map(Number);
        return (aH * 60 + aM) - (bH * 60 + bM);
    });

    if (todayClasses.length === 0) {
        todayScheduleCont.innerHTML = `<p class="empty-state">No classes today 🎉</p>`;
    } else {
        let html = '';
        todayClasses.forEach((cls, idx) => {
            // Gap between consecutive classes
            if (idx > 0) {
                const gap = calculateGap(todayClasses[idx - 1].end_time, cls.start_time);
                if (gap) html += `<div class="gap-row"><span>⏱ ${gap}</span></div>`;
            }

            const start = new Date(now);
            const [sh, sm] = cls.start_time.split(':').map(Number);
            start.setHours(sh, sm, 0, 0);

            const end = new Date(now);
            const [eh, em] = cls.end_time.split(':').map(Number);
            end.setHours(eh, em, 0, 0);

            let statusClass = '';
            if (now >= start && now <= end) statusClass = 'current-class';
            else if (now > end) statusClass = 'past-class';

            html += `
                <div class="today-class-card ${statusClass}">
                    <div class="class-type-dot ${cls.type.toLowerCase() === 'lab' ? 'dot-lab' : 'dot-theory'}"></div>
                    <div class="class-card-info">
                        <div class="class-card-name">${cls.course}</div>
                        <div class="class-card-meta">Room ${cls.room || 'TBA'} | ${cls.type}</div>
                    </div>
                    <div class="class-card-time">
                        <span class="class-card-time-start">${convertTo12Hour(cls.start_time)}</span>
                        <span class="class-card-time-end">to ${convertTo12Hour(cls.end_time)}</span>
                    </div>
                </div>`;
        });
        todayScheduleCont.innerHTML = html;
    }
}function updateTimers() {
    const now = new Date();
    let nextClass = null, minClassDiff = Infinity;
    let currentClass = null, classStart = null, classEnd = null;

    classes.forEach(cls => {
        const todayStr = DAYS_OF_WEEK[now.getDay()];
        if (cls.day === todayStr) {
            const start = new Date(now);
            const [sh, sm] = cls.start_time.split(':').map(Number);
            start.setHours(sh, sm, 0, 0);
            const end = new Date(now);
            const [eh, em] = cls.end_time.split(':').map(Number);
            end.setHours(eh, em, 0, 0);
            if (now >= start && now <= end) { currentClass = cls; classStart = start; classEnd = end; }
        }
        const nextOccurrence = getNextOccurrenceOfClass(cls, now);
        const diff = nextOccurrence - now;
        if (diff > 0 && diff < minClassDiff) { minClassDiff = diff; nextClass = cls; }
    });

    let nextExam = null, minExamDiff = Infinity;
    exams.forEach(ex => {
        const exDate = new Date(ex.date + 'T' + ex.time);
        const diff = exDate - now;
        const el = document.querySelector(`.exam-card-countdown[data-exam-id="${ex.id}"]`);
        if (el) {
            if (diff <= 0) el.textContent = 'Exam passed';
            else el.textContent = 'Starts in ' + formatDuration(diff);
        }
        if (diff > 0 && diff < minExamDiff) { minExamDiff = diff; nextExam = ex; }
    });

    let nextTask = null, minTaskDiff = Infinity;
    tasks.forEach(t => {
        const tDate = new Date(t.date + 'T' + t.time);
        const diff = tDate - now;
        const el = document.querySelector(`.exam-card-countdown[data-task-id="${t.id}"]`);
        if (el) {
            if (diff <= 0) el.textContent = 'Passed';
            else el.textContent = 'Due in ' + formatDuration(diff);
        }
        if (diff > 0 && diff < minTaskDiff) { minTaskDiff = diff; nextTask = t; }
    });

    const heroCard = document.getElementById('hero-card');
    if (currentClass) {
        const total = Math.max(1, Math.round((classEnd - classStart) / 60000));
        const elapsed = Math.round((now - classStart) / 60000);
        const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
        heroCard.innerHTML = `
            <div class="hero-label now">🔴 HAPPENING NOW</div>
            <div class="hero-course">${currentClass.course}</div>
            <div class="hero-meta">Room ${currentClass.room} | ${convertTo12Hour(currentClass.start_time)} - ${convertTo12Hour(currentClass.end_time)}</div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text2); margin-top:8px;">
                <span>${elapsed}m</span><span>${total}m</span>
            </div>
            <div class="progress-wrap"><div class="progress-bar" style="width:${percent}%"></div></div>`;
    } else if (nextClass && minClassDiff < minExamDiff) {
        heroCard.innerHTML = `
            <div class="hero-label next">🟢 NEXT CLASS</div>
            <div class="hero-course">${nextClass.course}</div>
            <div class="hero-meta">${nextClass.day} at ${convertTo12Hour(nextClass.start_time)} | Room ${nextClass.room}</div>
            <div class="hero-countdown">${formatDuration(minClassDiff)}</div>`;
    } else if (nextExam) {
        heroCard.innerHTML = `
            <div class="hero-label exam">📝 NEXT EXAM</div>
            <div class="hero-course">${nextExam.course}</div>
            <div class="hero-meta">${new Date(nextExam.date).toLocaleDateString()} at ${convertTo12Hour(nextExam.time)}</div>
            <div class="hero-countdown">${formatDuration(minExamDiff)}</div>`;
    } else if (nextTask && (!nextClass || minTaskDiff < minClassDiff) && (!nextExam || minTaskDiff < minExamDiff)) {
        heroCard.innerHTML = `
            <div class="hero-label exam" style="color:var(--amber);">📌 NEXT TASK</div>
            <div class="hero-course">${nextTask.title}</div>
            <div class="hero-meta">${new Date(nextTask.date).toLocaleDateString()} at ${convertTo12Hour(nextTask.time)}</div>
            <div class="hero-countdown">${formatDuration(minTaskDiff)}</div>`;
    } else {
        heroCard.innerHTML = `<div class="no-event">No upcoming classes or exams.<br>Enjoy your free time! ✨</div>`;
    }

    const ticker = document.getElementById('ticker-text');
    if (currentClass) ticker.innerHTML = `<span>🔴 Now: ${currentClass.course}</span>`;
    else if (minClassDiff < minExamDiff && nextClass) ticker.innerHTML = `<span>⏳ Next: ${nextClass.course} in ${formatDuration(minClassDiff)}</span>`;
    else if (nextExam) ticker.innerHTML = `<span>📝 Exam: ${nextExam.course} in ${formatDuration(minExamDiff)}</span>`;
    else ticker.innerHTML = `<span>All clear ✨</span>`;

    const examBanner = document.getElementById('next-exam-banner');
    if (nextExam) {
        examBanner.innerHTML = `
            <div class="exam-course">${nextExam.course}</div>
            <div class="exam-meta">${new Date(nextExam.date).toLocaleDateString()} at ${convertTo12Hour(nextExam.time)}</div>
            <div class="exam-countdown-big">${formatDuration(minExamDiff)}</div>`;
    } else {
        examBanner.innerHTML = `<span class="empty-state" style="padding:10px 0;">No upcoming exams 🎉</span>`;
    }
}function loadProjectCSV() {
    fetch('./Offered Course Report.csv')
        .then(response => { if (!response.ok) throw new Error('CSV not found'); return response.text(); })
        .then(csvText => parseCSV(csvText))
        .catch(err => console.log('CSV Search disabled:', err));
}

function parseCSV(csvText) {
    const lines = csvText.split(/\r\n|\n|\r/);
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rawCourses = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = [];
            let current = '', inQuotes = false;
            for (let j = 0; j < lines[i].length; j++) {
                const char = lines[i][j];
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { values.push(current); current = ''; }
                else current += char;
            }
            values.push(current);
            if (values.length >= headers.length) {
                const course = {};
                headers.forEach((h, idx) => course[h] = values[idx] ? values[idx].trim().replace(/"/g, '') : '');
                rawCourses.push(course);
            }
        }
    }
    
    const grouped = {};
    rawCourses.forEach(c => {
        const key = c['Course Title'] + '_' + c['Section'];
        if (!grouped[key]) grouped[key] = { title: c['Course Title'], code: c['Course Code'], section: c['Section'], schedules: [] };
        if (c['Day'] && c['Start Time'] && c['End Time']) {
            grouped[key].schedules.push({ day: c['Day'], start: c['Start Time'], end: c['End Time'], type: c['Type'] || 'Theory', room: c['Room'] || '' });
        }
    });
    
    csvCourses = Object.values(grouped).map(c => {
        const unique = [], seen = new Set();
        c.schedules.forEach(s => {
            const key = s.day + '_' + s.start + '_' + s.end;
            if (!seen.has(key)) { seen.add(key); unique.push(s); }
        });
        c.schedules = unique; return c;
    });
    
    const searchInput = document.getElementById('course-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if(val.length > 0) clearBtn.classList.remove('hidden'); else clearBtn.classList.add('hidden');
        if (val.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
        const filtered = csvCourses.filter(c => {
            const t = c.title?.toLowerCase() || '';
            const code = c.code?.toLowerCase() || '';
            const sec = c.section?.toLowerCase() || '';
            return t.includes(val) || code.includes(val) || sec.includes(val);
        });
        
        const container = document.getElementById('search-results');
        const results = filtered.slice(0, 20);
        if (results.length === 0) { container.innerHTML = '<div style="padding:10px; color:var(--text2); text-align:center;">No courses found.</div>'; return; }
        
        window._tempCourses = results;
        container.innerHTML = results.map((c, i) => {
            const scheds = c.schedules.map(s => s.day + ' ' + s.start + '-' + s.end + ' (' + s.room + ')').join(', ');
            return `
                <div class="search-result-item" onclick="addCourseFromSearch(${i})">
                    <div class="search-result-title">${c.title}</div>
                    <div class="search-result-meta">Code: ${c.code} | Sec: ${c.section}</div>
                    <div class="search-result-schedules">${scheds || 'No schedule'}</div>
                    <button class="btn-add-course">+ Add to Schedule</button>
                </div>`;
        }).join('');
    });
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = ''; clearBtn.classList.add('hidden');
        document.getElementById('search-results').innerHTML = ''; searchInput.focus();
    });
}

window.addCourseFromSearch = async function(idx) {
    const course = window._tempCourses[idx];
    if (!course || course.schedules.length === 0) { showToast('No schedule data found.'); return; }
    if(!confirm('Add ' + course.title + ' to your schedule?')) return;

    showLoader();
    const convertTime = (t) => {
        const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if(m) {
            let h = parseInt(m[1]);
            if(m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
            if(m[3].toUpperCase() === 'AM' && h === 12) h = 0;
            return h.toString().padStart(2,'0') + ':' + m[2];
        }
        return t;
    };

    const inserts = course.schedules.map(s => ({ user_id: userKey, course: course.title, day: s.day, start_time: convertTime(s.start), end_time: convertTime(s.end), type: s.type, room: s.room }));
    
    try {
        const { data, error } = await db.from('classes').insert(inserts).select();
        
        if (!error) {
            classes.push(...data); updateAllViews();
            document.getElementById('course-search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('btn-clear-search').classList.add('hidden');
            document.getElementById('nav-schedule').click();
            showToast('Course added successfully!');
        } else { 
            console.error(error);
            showToast('Error saving to database.'); 
        }
    } catch (e) {
        console.error(e);
        showToast('Network error! Please check your connection.');
    }
    
    hideLoader();
};

function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const leadMs = reminderLeadTime * 60 * 1000;
    classes.forEach(cls => {
        const diff = getNextOccurrenceOfClass(cls, now) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) new Notification('Class Reminder', { body: 'Upcoming class: ' + cls.course + ' at ' + convertTo12Hour(cls.start_time) + ' (Room ' + cls.room + ')' });
    });
    exams.forEach(ex => {
        const diff = new Date(ex.date + 'T' + ex.time) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) new Notification('Exam Reminder', { body: 'Upcoming exam: ' + ex.course + ' at ' + convertTo12Hour(ex.time) });
    });
    tasks.forEach(t => {
        const diff = new Date(t.date + 'T' + t.time) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) new Notification('Task Reminder', { body: 'Upcoming task: ' + t.title + ' at ' + convertTo12Hour(t.time) });
    });
}

function setupTheme() {
    let savedTheme = 'theme-dark';
    try {
        savedTheme = localStorage.getItem('classify_theme') || 'theme-dark';
    } catch(e) {}
    
    applyTheme(savedTheme);

    const themeBtns = document.querySelectorAll('.theme-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const theme = e.target.getAttribute('data-theme');
            applyTheme(theme);
        });
    });
}

function applyTheme(themeName) {
    document.body.className = themeName;
    try { localStorage.setItem('classify_theme', themeName); } catch(e) {}
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.getAttribute('data-theme') === themeName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
