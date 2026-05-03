const SUPABASE_URL = 'https://vmmyzuauiscukyapudqc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbXl6dWF1aXNjdWt5YXB1ZHFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODg1MzAsImV4cCI6MjA5Mjk2NDUzMH0.2LlpdHhzrYnroUbfDZpTtgjP_j_WpsV4MtR7FWJF6XI';
let db = null;
let userKey = null;
let classes = [];
let exams = [];
let tasks = [];
let csvCourses = [];
let plannerCourses = [];
let plannerSchedule = [];
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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedTime = localStorage.getItem('reminderLeadTime');
        if (storedTime) reminderLeadTime = parseInt(storedTime);
    } catch (e) { console.warn('localStorage not available', e); }

    setupTheme();
    setupNavigation();
    setupModals();
    setupForms();
    setupPlanner();
    if (window.supabase) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        loadProjectCSV();
        setupAuthOverlay();

        // Check active session
        const { data: { session }, error } = await db.auth.getSession();
        if (session) {
            handleLoginSuccess(session.user);
        }

        // Listen for auth changes
        db.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                handleLoginSuccess(session.user);
            } else if (event === 'SIGNED_OUT') {
                userKey = null;
                classes = []; exams = []; tasks = [];
                plannerSchedule = []; plannerCourses = [];
                document.getElementById('sb-admin')?.classList.add('hidden');
                document.getElementById('btn-admin-top')?.classList.add('hidden');
                document.getElementById('auth-overlay').classList.remove('hidden');
                document.getElementById('app').classList.add('hidden');
                document.getElementById('modal-settings')?.classList.add('hidden');
                hideLoader();
            }
        });
    } else {
        showToast("Error: Supabase client not loaded");
    }
});

function handleLoginSuccess(user) {
    userKey = user.id;
    document.getElementById('auth-overlay').classList.add('hidden');
    if (user.email && user.email.trim().toLowerCase() === 'mubin9516@gmail.com') {
        document.getElementById('sb-admin')?.classList.remove('hidden');
        document.getElementById('btn-admin-top')?.classList.remove('hidden');
        setupAdminPanel();
    }
    initApp();
    checkGlobalExams();
}

function setupAuthOverlay() {
    document.getElementById('tab-login').addEventListener('click', () => switchKeyTab('login'));
    document.getElementById('tab-register').addEventListener('click', () => switchKeyTab('register'));
    
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('auth-error');
        const btn = document.getElementById('btn-login');
        
        btn.textContent = 'Logging in...';
        btn.disabled = true;
        
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        
        btn.textContent = 'Login';
        btn.disabled = false;
        
        if (error) {
            errEl.textContent = error.message;
            errEl.classList.remove('hidden');
        } else {
            errEl.classList.add('hidden');
            document.getElementById('login-form').reset();
        }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errEl = document.getElementById('auth-error');
        const btn = document.getElementById('btn-register');
        
        btn.textContent = 'Creating account...';
        btn.disabled = true;
        
        const { data, error } = await db.auth.signUp({ email, password });
        
        btn.textContent = 'Γ£¿ Create Account';
        btn.disabled = false;
        
        if (error) {
            errEl.textContent = error.message;
            errEl.classList.remove('hidden');
        } else {
            errEl.classList.add('hidden');
            if (data.user && data.session) {
                // Auto logged in
                document.getElementById('register-form').reset();
            } else {
                errEl.textContent = "Please check your email to verify your account.";
                errEl.classList.remove('hidden');
            }
        }
    });
}

function switchKeyTab(tabName) {
    document.querySelectorAll('.key-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.key-panel').forEach(p => p.classList.remove('active'));
    const t = document.getElementById('tab-' + tabName);
    if(t) t.classList.add('active');
    document.getElementById('panel-' + tabName).classList.add('active');
}

async function initApp() {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('settings-share-id-display').textContent = userKey;
    showLoader();
    await fetchClasses();
    await fetchExams();
    await fetchTasks();
    await fetchPlannerSchedule();
    await fetchGlobalPlannerCourses();
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
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const tabs = document.querySelectorAll('.tab-section');

    const activateTab = (tabName, sourceNavs, otherNavs) => {
        sourceNavs.forEach(n => n.classList.remove('active'));
        otherNavs.forEach(n => n.classList.remove('active'));
        tabs.forEach(t => {
            t.classList.remove('active');
            if(t.id === `tab-${tabName}`) t.classList.add('active');
        });
        sourceNavs.forEach(n => { if (n.dataset.tab === tabName) n.classList.add('active'); });
        otherNavs.forEach(n => { if (n.dataset.tab === tabName) n.classList.add('active'); });
    };

    navItems.forEach(nav => {
        nav.addEventListener('click', () => activateTab(nav.dataset.tab, navItems, sidebarItems));
    });
    sidebarItems.forEach(nav => {
        nav.addEventListener('click', () => activateTab(nav.dataset.tab, sidebarItems, navItems));
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
    document.getElementById('fab-upload-personal')?.addEventListener('click', () => {
        document.getElementById('user-routine-upload').click();
    });
    document.getElementById('user-routine-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        toggleSheet();
        showLoader();
        try {
            const arrayBuffer = await file.arrayBuffer();
            let parsedCourses = [];
            if (file.name.endsWith('.csv')) {
                const text = new TextDecoder().decode(arrayBuffer);
                parsedCourses = parsePlannerCSV(text);
            } else {
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                parsedCourses = parsePlannerJSON(json);
            }

            if(parsedCourses.length === 0) {
                showToast('No courses found in file');
            } else {
                let added = 0;
                parsedCourses.forEach(course => {
                    course.schedules.forEach(s => {
                        schedule.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            title: course.title + (course.section ? ` [${course.section}]` : ''),
                            type: 'Theory', 
                            day: s.day,
                            start: s.start,
                            end: s.end,
                            room: s.room || ''
                        });
                        added++;
                    });
                });
                if(added > 0) {
                    saveData();
                    renderHome();
                    renderSchedule();
                    showToast(`Imported ${added} classes successfully!`);
                } else {
                    showToast('No valid schedules found in file');
                }
            }
        } catch (err) {
            console.error(err);
            showToast('Error parsing file: ' + err.message);
        }
        hideLoader();
        e.target.value = '';
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
    document.getElementById('sb-help')?.addEventListener('click', () => document.getElementById('modal-help').classList.remove('hidden'));
    document.getElementById('sb-settings')?.addEventListener('click', () => document.getElementById('modal-settings').classList.remove('hidden'));
    document.getElementById('sb-admin')?.addEventListener('click', () => document.getElementById('modal-admin').classList.remove('hidden'));
    document.getElementById('btn-admin-top')?.addEventListener('click', () => document.getElementById('modal-admin').classList.remove('hidden'));
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

    document.getElementById('btn-copy-share-id').addEventListener('click', (e) => {
        navigator.clipboard.writeText(userKey);
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 2000);
    });

    document.getElementById('btn-enable-notif').addEventListener('click', () => {
        if ('Notification' in window) Notification.requestPermission().then(p => showToast('Notifications ' + p));
    });

    document.getElementById('btn-settings-import-key').addEventListener('click', async () => {
        const inputKey = document.getElementById('settings-import-key-input').value.trim();
        if (!inputKey || inputKey.length < 10) {
            showToast("Please enter a valid key to import");
            return;
        }

        if (inputKey === userKey) {
            showToast("You cannot import from your own key");
            return;
        }

        if (!db) {
            showToast("Database connection error");
            return;
        }

        const btn = document.getElementById('btn-settings-import-key');
        const oldText = btn.textContent;
        btn.textContent = 'Importing...';
        btn.disabled = true;
        showLoader();

        try {
            const { data: oldClasses } = await db.from('classes').select('*').eq('user_id', inputKey);
            const { data: oldExams } = await db.from('exams').select('*').eq('user_id', inputKey);
            const { data: oldTasks } = await db.from('tasks').select('*').eq('user_id', inputKey);

            let added = false;

            if (oldClasses && oldClasses.length > 0) {
                const newClasses = oldClasses.map(c => {
                    const { id, created_at, ...rest } = c;
                    return { ...rest, user_id: userKey };
                });
                await db.from('classes').insert(newClasses);
                added = true;
            }

            if (oldExams && oldExams.length > 0) {
                const newExams = oldExams.map(e => {
                    const { id, created_at, ...rest } = e;
                    return { ...rest, user_id: userKey };
                });
                await db.from('exams').insert(newExams);
                added = true;
            }

            if (oldTasks && oldTasks.length > 0) {
                const newTasks = oldTasks.map(t => {
                    const { id, created_at, ...rest } = t;
                    return { ...rest, user_id: userKey };
                });
                await db.from('tasks').insert(newTasks);
                added = true;
            }

            if (added) {
                document.getElementById('settings-import-key-input').value = '';
                document.getElementById('modal-settings').classList.add('hidden');
                showToast("Schedule imported successfully!");
                await fetchClasses();
                await fetchExams();
                await fetchTasks();
                updateAllViews();
            } else {
                showToast("No data found for that key");
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to import schedule");
        } finally {
            btn.textContent = oldText;
            btn.disabled = false;
            hideLoader();
        }
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

    document.getElementById('btn-logout').addEventListener('click', async () => {
        if(confirm("Are you sure you want to log out?")) {
            showLoader();
            try {
                const { error } = await db.auth.signOut();
                if (error) throw error;
            } catch (err) {
                console.error("Logout error:", err);
                showToast("Error logging out. Please try again.");
            }
            hideLoader();
            location.reload();
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

function updateAllViews() { renderSchedule(); renderExams(); renderTasks(); renderHome(); renderPlanner(); updateTimers(); }

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
                if (gap) html += `<div class="gap-row"><span>GAP ${gap}</span></div>`;
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
                    ≡ƒôà ${new Date(exam.date).toLocaleDateString()} at ${convertTo12Hour(exam.time)}
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
                    ≡ƒôà ${new Date(task.date).toLocaleDateString()} at ${convertTo12Hour(task.time)}
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
        todayScheduleCont.innerHTML = `<p class="empty-state">No classes today</p>`;
    } else {
        let html = '';
        todayClasses.forEach((cls, idx) => {
            // Gap between consecutive classes
            if (idx > 0) {
                const gap = calculateGap(todayClasses[idx - 1].end_time, cls.start_time);
                if (gap) html += `<div class="gap-row"><span>GAP ${gap}</span></div>`;
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
            <div class="hero-label now">HAPPENING NOW</div>
            <div class="hero-course">${currentClass.course}</div>
            <div class="hero-meta">Room ${currentClass.room} | ${convertTo12Hour(currentClass.start_time)} - ${convertTo12Hour(currentClass.end_time)}</div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text2); margin-top:8px;">
                <span>${elapsed}m</span><span>${total}m</span>
            </div>
            <div class="progress-wrap"><div class="progress-bar" style="width:${percent}%"></div></div>`;
    } else if (nextClass && minClassDiff < minExamDiff) {
        heroCard.innerHTML = `
            <div class="hero-label next">NEXT CLASS</div>
            <div class="hero-course">${nextClass.course}</div>
            <div class="hero-meta">${nextClass.day} at ${convertTo12Hour(nextClass.start_time)} | Room ${nextClass.room}</div>
            <div class="hero-countdown">${formatDuration(minClassDiff)}</div>`;
    } else if (nextExam) {
        heroCard.innerHTML = `
            <div class="hero-label exam">NEXT EXAM</div>
            <div class="hero-course">${nextExam.course}</div>
            <div class="hero-meta">${new Date(nextExam.date).toLocaleDateString()} at ${convertTo12Hour(nextExam.time)}</div>
            <div class="hero-countdown">${formatDuration(minExamDiff)}</div>`;
    } else if (nextTask && (!nextClass || minTaskDiff < minClassDiff) && (!nextExam || minTaskDiff < minExamDiff)) {
        heroCard.innerHTML = `
            <div class="hero-label exam" style="color:var(--amber);">NEXT TASK</div>
            <div class="hero-course">${nextTask.title}</div>
            <div class="hero-meta">${new Date(nextTask.date).toLocaleDateString()} at ${convertTo12Hour(nextTask.time)}</div>
            <div class="hero-countdown">${formatDuration(minTaskDiff)}</div>`;
    } else {
        heroCard.innerHTML = `<div class="no-event">No upcoming classes or exams.<br>Enjoy your free time!</div>`;
    }

    const ticker = document.getElementById('ticker-text');
    if (currentClass) ticker.innerHTML = `<span>Now: ${currentClass.course}</span>`;
    else if (minClassDiff < minExamDiff && nextClass) ticker.innerHTML = `<span>Next: ${nextClass.course} in ${formatDuration(minClassDiff)}</span>`;
    else if (nextExam) ticker.innerHTML = `<span>Exam: ${nextExam.course} in ${formatDuration(minExamDiff)}</span>`;
    else ticker.innerHTML = `<span>All clear</span>`;

    const examBanner = document.getElementById('next-exam-banner');
    if (nextExam) {
        examBanner.innerHTML = `
            <div class="exam-course">${nextExam.course}</div>
            <div class="exam-meta">${new Date(nextExam.date).toLocaleDateString()} at ${convertTo12Hour(nextExam.time)}</div>
            <div class="exam-countdown-big">${formatDuration(minExamDiff)}</div>`;
    } else {
        examBanner.innerHTML = `<span class="empty-state" style="padding:10px 0;">No upcoming exams</span>`;
    }
}
async function loadProjectCSV() {
    try {
        const { data, error } = await db.from('global_classes').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
            csvCourses = data.map(c => ({
                title: c.title,
                code: c.code || '',
                section: c.section || '',
                schedules: c.schedules.map(s => ({
                    day: s.day,
                    start: s.start,
                    end: s.end,
                    room: s.room || '',
                    type: 'Theory'
                }))
            }));
        }
    } catch (err) {
        console.log('Global Course Search disabled:', err);
    }
    
    const searchInput = document.getElementById('course-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    
    // Rebind listeners safely
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    const newClearBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
    
    newSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if(val.length > 0) newClearBtn.classList.remove('hidden'); else newClearBtn.classList.add('hidden');
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
    
    newClearBtn.addEventListener('click', () => {
        newSearchInput.value = ''; newClearBtn.classList.add('hidden');
        document.getElementById('search-results').innerHTML = ''; newSearchInput.focus();
    });}

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

/** ===== PLANNER FUNCTIONS ===== **/

async function fetchPlannerSchedule() {
    if (!db || !userKey) return;
    try {
        const { data, error } = await db.from('planner_schedule').select('*').eq('user_id', userKey);
        if (!error) plannerSchedule = data || [];
    } catch(e) { console.error(e); }
}

async function fetchGlobalPlannerCourses() {
    if (!db) return;
    try {
        const { data, error } = await db.from('global_planner_courses').select('*');
        if (!error) plannerCourses = data || [];
    } catch(e) { console.error(e); }
}

function setupPlanner() {
    const searchInput = document.getElementById('planner-search-input');
    const clearBtn = document.getElementById('btn-clear-planner-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        if (q.length === 0) {
            clearBtn.classList.add('hidden');
            document.getElementById('planner-search-results').innerHTML = '';
            return;
        }
        clearBtn.classList.remove('hidden');
        const results = plannerCourses.filter(c =>
            (c.title && c.title.toLowerCase().includes(q)) ||
            (c.code && c.code.toLowerCase().includes(q)) ||
            (c.section && c.section.toLowerCase().includes(q))
        ).slice(0, 20);

        window._tempPlannerResults = results;
        const container = document.getElementById('planner-search-results');
        if (results.length === 0) {
            container.innerHTML = `<p class="empty-state" style="padding:16px;">No courses found.</p>`;
            return;
        }
        container.innerHTML = results.map((c, i) => {
            const schedArr = Array.isArray(c.schedules) ? c.schedules : [];
            const scheds = schedArr.map(s => `${s.day} ${convertTo12Hour(s.start)} - ${convertTo12Hour(s.end)}`).join(', ') || 'No schedule';
            return `<div class="search-result-item" onclick="addCourseToPlanner(${i})" style="cursor:pointer; padding:12px; border-bottom:1px solid var(--border); border-radius:8px; margin-bottom:4px; background:var(--surface2);">
                <div style="font-weight:600; font-size:0.9rem;">${c.title}</div>
                <div style="font-size:0.8rem; color:var(--text2);">Code: ${c.code || 'N/A'} | Sec: ${c.section}</div>
                <div style="font-size:0.78rem; color:var(--text2); margin-top:2px;">${scheds}</div>
            </div>`;
        }).join('');
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        document.getElementById('planner-search-results').innerHTML = '';
        searchInput.focus();
    });
}

function renderPlanner() {
    const container = document.getElementById('planner-container');
    if (!container) return;
    if (!plannerSchedule || plannerSchedule.length === 0) {
        container.innerHTML = `<p class="empty-state full-empty">No planned courses yet.<br/>Search above to add to your plan.</p>`;
        return;
    }
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const grouped = {};
    plannerSchedule.forEach(s => {
        if (!grouped[s.day]) grouped[s.day] = [];
        grouped[s.day].push(s);
    });
    let html = '';
    days.forEach(day => {
        if (!grouped[day]) return;
        const sorted = grouped[day].sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''));
        html += `<div class="day-block"><div class="day-block-header"><div class="day-block-title">${day}</div></div><div class="day-block-body">`;
        sorted.forEach(s => {
            html += `<div class="class-row">
                <div class="class-type-dot dot-theory"></div>
                <div class="class-row-info">
                    <div class="class-row-name">${s.course_title || s.course}</div>
                    <div class="class-row-meta">${convertTo12Hour(s.start_time)} - ${convertTo12Hour(s.end_time)} | Sec: ${s.section || ''}</div>
                </div>
                <div class="class-row-actions">
                    <button class="btn-del" onclick="removePlannerCourse('${s.id}')">Remove</button>
                </div>
            </div>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html;
}

function checkClash(day, startTime, endTime, schedule) {
    const toMin = t => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
    const newStart = toMin(startTime), newEnd = toMin(endTime);
    for (const s of schedule) {
        if (s.day !== day) continue;
        const sStart = toMin(s.start_time), sEnd = toMin(s.end_time);
        if (newStart < sEnd && newEnd > sStart) return s;
    }
    return null;
}

window.addCourseToPlanner = async function(idx) {
    const course = (window._tempPlannerResults || [])[idx];
    if (!course) return;
    const schedArr = Array.isArray(course.schedules) ? course.schedules : [];
    if (schedArr.length === 0) { showToast('No schedule data for this course.'); return; }

    for (const sched of schedArr) {
        const clash = checkClash(sched.day, sched.start, sched.end, plannerSchedule);
        if (clash) {
            alert(`⚠️ Clash! Cannot add ${course.title} — clashes with ${clash.course_title} on ${clash.day}.`);
            return;
        }
    }

    showLoader();
    const inserts = schedArr.map(s => ({
        user_id: userKey,
        course_title: course.title,
        course_code: course.code || '',
        section: course.section,
        day: s.day,
        start_time: s.start,
        end_time: s.end,
        room: s.room || ''
    }));
    const { data, error } = await db.from('planner_schedule').insert(inserts).select();
    if (!error) {
        plannerSchedule.push(...data);
        renderPlanner();
        showToast(`Added ${course.title}!`);
    } else {
        showToast('Error adding course.');
    }
    hideLoader();
};

window.removePlannerCourse = async function(id) {
    if (!confirm('Remove this course from your plan?')) return;
    showLoader();
    const { error } = await db.from('planner_schedule').delete().eq('id', id);
    if (!error) {
        plannerSchedule = plannerSchedule.filter(s => s.id !== id);
        renderPlanner();
        showToast('Course removed.');
    }
    hideLoader();
};

/** ===== ADMIN & SYNC FUNCTIONS ===== **/

function setupAdminPanel() {
    const fileInput = document.getElementById('admin-exam-upload');
    const processBtn = document.getElementById('btn-admin-process');
    const status = document.getElementById('admin-exam-status');
    const resultsDiv = document.getElementById('admin-results');

    if (processBtn) {
        processBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const file = fileInput?.files[0];
            if (!file) { showToast('Please select an Excel or CSV file.'); return; }
            showLoader();
            if (status) status.textContent = 'Processing...';
            if (resultsDiv) resultsDiv.classList.add('hidden');

            try {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                // Use header: 1 to get a raw array of arrays (rows)
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                const parsedExams = parseExamExcelJSON(rows);
                
                if (parsedExams.length === 0) {
                    if (status) status.textContent = 'No exams found. Check file format.';
                    if (resultsDiv) {
                        resultsDiv.classList.remove('hidden');
                        resultsDiv.innerHTML = `<div style="color:var(--pink); font-weight:700; margin-bottom:8px;">Debug: No matches in ${rows.length} rows.</div>` + 
                            rows.slice(0, 10).map(r => `<div style="border-bottom:1px solid var(--border); padding:4px;">Row: ${JSON.stringify(r)}</div>`).join('');
                    }
                } else {
                    const examType = document.getElementById('admin-exam-type')?.value || '';
                    parsedExams.forEach(ex => ex.exam_type = examType);
                    
                    if (status) status.textContent = `Found ${parsedExams.length} exams. Syncing...`;
                    await db.from('global_exams').delete().neq('id', 0);
                    
                    for (let i = 0; i < parsedExams.length; i += 500) {
                        const { error } = await db.from('global_exams').insert(parsedExams.slice(i, i+500));
                        if (error) throw error;
                    }
                    
                    if (status) status.textContent = `✅ Synced ${parsedExams.length} exams!`;
                    if (resultsDiv) {
                        resultsDiv.classList.remove('hidden');
                        resultsDiv.style.whiteSpace = 'normal';
                        resultsDiv.innerHTML = parsedExams.slice(0,5).map(e => `<div>${e.exam_date} | ${e.course} (${e.sections})</div>`).join('');
                    }
                }
            } catch (err) {
                console.error(err);
                if (status) status.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    const catalogBtn = document.getElementById('btn-admin-catalog-process');
    const catalogFile = document.getElementById('admin-catalog-file');
    const catalogStatus = document.getElementById('admin-catalog-status');

    if (catalogBtn) {
        catalogBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const file = catalogFile?.files[0];
            if (!file) { showToast('Please select an Excel or CSV file.'); return; }
            showLoader();
            catalogStatus.textContent = 'Processing...';
            try {
                const arrayBuffer = await file.arrayBuffer();
                let parsedCourses = [];
                if (file.name.endsWith('.csv')) {
                    const text = new TextDecoder().decode(arrayBuffer);
                    parsedCourses = parsePlannerCSV(text);
                } else {
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    parsedCourses = parsePlannerJSON(json);
                }
                if (parsedCourses.length === 0) {
                    catalogStatus.textContent = 'No courses found. Check file format.';
                } else {
                    await db.from('global_classes').delete().neq('id', 0);
                    for (let i = 0; i < parsedCourses.length; i += 500) {
                        const { error } = await db.from('global_classes').insert(parsedCourses.slice(i, i+500));
                        if (error) throw error;
                    }
                    catalogStatus.textContent = `✅ Synced ${parsedCourses.length} courses!`;
                    loadProjectCSV();
                }
            } catch(err) {
                console.error(err);
                catalogStatus.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    const plannerBtn = document.getElementById('btn-admin-planner-process');
    const plannerFile = document.getElementById('admin-planner-file');
    const plannerStatus = document.getElementById('admin-planner-status');

    if (plannerBtn) {
        plannerBtn.addEventListener('click', async () => {
            const file = plannerFile?.files[0];
            if (!file) { showToast('Please select an Excel or CSV file.'); return; }
            showLoader();
            plannerStatus.textContent = 'Processing...';
            try {
                const arrayBuffer = await file.arrayBuffer();
                let parsedCourses = [];
                if (file.name.endsWith('.csv')) {
                    const text = new TextDecoder().decode(arrayBuffer);
                    parsedCourses = parsePlannerCSV(text);
                } else {
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    parsedCourses = parsePlannerJSON(json);
                }
                if (parsedCourses.length === 0) {
                    plannerStatus.textContent = 'No courses found. Check file format.';
                } else {
                    await db.from('global_planner_courses').delete().neq('id', 0);
                    for (let i = 0; i < parsedCourses.length; i += 500) {
                        const { error } = await db.from('global_planner_courses').insert(parsedCourses.slice(i, i+500));
                        if (error) throw error;
                    }
                    plannerStatus.textContent = `✅ Synced ${parsedCourses.length} courses!`;
                    plannerCourses = parsedCourses;
                }
            } catch(err) {
                console.error(err);
                plannerStatus.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }
}

function parseExamExcelJSON(rows) {
    const results = [];
    let currentDate = null;
    let currentTime = null;
    let currentVenue = '';
    
    const dateRegex = /([A-Za-z]+ \d{1,2},\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i;
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i;
    const slotRegex = /Slot\s*(\d+)/i;
    const venueKeywords = ['ANNEX', 'BUILDING', 'ROOM', 'DSK', 'CAMPUS', 'LAB', 'ARCH'];
    
    // AIUB Exam Slot mapping
    const slotTimes = {
        '1': '9:00 AM - 11:00 AM',
        '2': '12:00 PM - 2:00 PM',
        '3': '3:00 PM - 5:00 PM'
    };

    rows.forEach(row => {
        if (!Array.isArray(row)) return;
        const values = row.map(v => v ? String(v).trim() : '');
        const rowText = values.join(' ');
        
        // 1. Detect Date
        const dateMatch = rowText.match(dateRegex);
        if (dateMatch) {
            try { currentDate = new Date(dateMatch[1]).toISOString().split('T')[0]; } catch(e) {}
        }
        
        // 2. Detect Time or Slot
        const slotMatch = rowText.match(slotRegex);
        if (slotMatch) {
            currentTime = slotTimes[slotMatch[1]] || `Slot ${slotMatch[1]}`;
        } else {
            const timeMatch = rowText.match(timeRegex);
            if (timeMatch) {
                currentTime = timeMatch[1] + ' - ' + timeMatch[2];
            } else {
                const times = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/ig);
                if (times && times.length >= 2) {
                    currentTime = times[0] + ' - ' + times[1];
                } else if (times && times.length === 1 && !currentTime) {
                    // If we only find one time and don't have a current one, use it as a start
                    currentTime = times[0];
                }
            }
        }
        
        // 3. Detect Venue Header
        const nonDateValues = values.filter(v => v && !dateRegex.test(v) && !timeRegex.test(v) && !slotRegex.test(v));
        if (nonDateValues.length === 1) {
            const val = nonDateValues[0].toUpperCase();
            if (venueKeywords.some(k => val.includes(k))) {
                currentVenue = val;
                return;
            }
        }

        // 4. Extract Course Info
        if (currentDate && currentTime) {
            const courseVals = values.filter(v => {
                const upper = v.toUpperCase();
                return v &&
                       !timeRegex.test(v) && 
                       !dateRegex.test(v) && 
                       !slotRegex.test(v) &&
                       v !== '-' && 
                       !upper.includes('AM') && 
                       !upper.includes('PM') && 
                       upper !== 'TIME' &&
                       upper !== 'COURSE TITLE' &&
                       upper !== 'SECTIONS' &&
                       upper !== 'VENUE';
            });
            
            if (courseVals.length >= 2) {
                const courseName = courseVals[0];
                const sections = courseVals[1];
                const rowVenue = courseVals.length > 2 ? courseVals[2] : currentVenue;
                
                const lowerName = courseName.toLowerCase();
                if (courseName.length > 4 && 
                    !lowerName.includes('day') && 
                    !lowerName.includes('slot') && 
                    !lowerName.includes('date:') && 
                    !lowerName.includes('published on') &&
                    !lowerName.includes('except llb')) {
                    
                    results.push({
                        exam_date: currentDate,
                        time: currentTime,
                        course: courseName,
                        sections: sections,
                        venue: rowVenue
                    });
                }
            }
        }
    });
    
    return results;
}

function parsePlannerCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    const courses = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const vals = [];
        let cur = '', inQ = false;
        for (const ch of lines[i]) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
            else cur += ch;
        }
        vals.push(cur);
        const row = {};
        headers.forEach((h,idx) => row[h] = (vals[idx]||'').trim().replace(/"/g,''));

        const title = row['Course Title'] || row['Title'];
        const section = row['Section'];
        if (!title || !section) continue;

        const key = `${title}_${section}`;
        if (!courses[key]) {
            courses[key] = { title, code: row['Course Code']||'', section, schedules: [], credits: parseInt(row['Credits'])||3 };
        }
        if (row['Day'] && row['Start Time']) {
            courses[key].schedules.push({ day: row['Day'], start: convertTimeForPlanner(row['Start Time']), end: convertTimeForPlanner(row['End Time']), room: row['Room']||'' });
        }
    }
    return Object.values(courses);
}

function parsePlannerJSON(json) {
    const courses = {};
    json.forEach(row => {
        const title = row['Course Title'] || row['Title'];
        const section = String(row['Section']||'');
        if (!title || !section) return;
        const key = `${title}_${section}`;
        if (!courses[key]) {
            courses[key] = { title, code: String(row['Course Code']||''), section, schedules: [], credits: parseInt(row['Credits'])||3 };
        }
        if (row['Day'] && row['Start Time']) {
            courses[key].schedules.push({ day: String(row['Day']), start: convertTimeForPlanner(String(row['Start Time'])), end: convertTimeForPlanner(String(row['End Time']||'')), room: String(row['Room']||'') });
        }
    });
    return Object.values(courses);
}

function convertTimeForPlanner(t) {
    if (!t) return null;
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
        let h = parseInt(m[1]);
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
        return h.toString().padStart(2,'0') + ':' + m[2] + ':00';
    }
    // Try 24h format HH:MM
    const m24 = t.match(/^(\d{1,2}):(\d{2})/);
    if (m24) return m24[1].padStart(2,'0') + ':' + m24[2] + ':00';
    return null;
}

async function checkGlobalExams() {
    if (!db || !userKey) return;
    try {
        const { data: myClasses } = await db.from('classes').select('course, section').eq('user_id', userKey);
        if (!myClasses || myClasses.length === 0) return;

        const { data: globalExams } = await db.from('global_exams').select('*');
        if (!globalExams || globalExams.length === 0) return;

        const { data: existingExams } = await db.from('exams').select('title').eq('user_id', userKey);
        const existingTitles = new Set((existingExams || []).map(e => e.title));

        const toSync = [];
        myClasses.forEach(cls => {
            globalExams.forEach(ge => {
                if (!ge.course) return;
                const titleMatch = ge.course.toLowerCase().includes(cls.course.toLowerCase()) || cls.course.toLowerCase().includes(ge.course.toLowerCase());
                const sectionsRaw = (ge.sections || '');
                const sectionMatch = !sectionsRaw || sectionsRaw.includes(cls.section);
                if (titleMatch && sectionMatch) {
                    const title = `${ge.course}${ge.exam_type ? ' (' + ge.exam_type + ')' : ''}`;
                    if (!existingTitles.has(title)) {
                        existingTitles.add(title);
                        toSync.push({
                            user_id: userKey,
                            title,
                            date: ge.exam_date || '',
                            time: convertTimeForPlanner(ge.time) || ge.time || '09:00:00',
                            notes: ge.venue ? 'Venue: ' + ge.venue : ''
                        });
                    }
                }
            });
        });

        if (toSync.length > 0) {
            const modal = document.getElementById('modal-sync-prompt');
            const text = document.getElementById('sync-prompt-text');
            if (modal && text) {
                text.innerHTML = `We found <strong>${toSync.length} exam(s)</strong> matching your enrolled courses. Add them to your schedule?`;
                modal.classList.remove('hidden');
                const syncBtn = document.getElementById('btn-sync-now');
                if (syncBtn) {
                    syncBtn.onclick = async () => {
                        syncBtn.disabled = true;
                        syncBtn.textContent = 'Syncing...';
                        await db.from('exams').insert(toSync);
                        await fetchExams();
                        updateAllViews();
                        modal.classList.add('hidden');
                        syncBtn.disabled = false;
                        syncBtn.textContent = 'Sync to My Exams';
                        showToast(`Synced ${toSync.length} exam(s)!`);
                    };
                }
            }
        }
    } catch(e) { console.error('checkGlobalExams error:', e); }
}
