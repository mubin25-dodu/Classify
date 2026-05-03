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
        if (storedTime) {
            reminderLeadTime = parseInt(storedTime);
            const select = document.getElementById('reminder-minutes');
            if (select) select.value = reminderLeadTime.toString();
        }
    } catch (e) { console.warn('localStorage not available', e); }

    setupTheme();
    setupNavigation();
    setupModals();
    setupForms();
    setupPlanner();
    initNotifToggle();
    setupNotificationSettings();
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
    }

    // PASTE MODE
    const pasteBtn = document.getElementById('btn-admin-paste-process');
    const pasteArea = document.getElementById('admin-exam-paste');

    if (pasteBtn) {
        pasteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const text = pasteArea?.value?.trim();
            if (!text) { showToast('Please paste some text first.'); return; }
            
            showLoader();
            if (status) status.textContent = 'Parsing pasted text...';
            if (resultsDiv) resultsDiv.classList.add('hidden');

            try {
                // Split by newlines, then split each line by multiple spaces to simulate columns
                const rows = text.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return null;
                    // Split by 2 or more spaces, or tab
                    return trimmed.split(/\s{2,}|\t/);
                }).filter(Boolean);

                const parsedExams = parseExamExcelJSON(rows);

                if (parsedExams.length === 0) {
                    if (status) status.textContent = 'No exams found in pasted text. Check format.';
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
                    
                    if (status) status.textContent = `✅ Successfully synced ${parsedExams.length} exams!`;
                    if (pasteArea) pasteArea.value = ''; // Clear after success
                }
            } catch (err) {
                console.error(err);
                if (status) status.textContent = 'Error: ' + err.message;
            } finally {
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
    
    // Load from cache immediately
    try {
        const cachedClasses = localStorage.getItem(`classes_${userKey}`);
        const cachedExams = localStorage.getItem(`exams_${userKey}`);
        const cachedTasks = localStorage.getItem(`tasks_${userKey}`);
        
        if (cachedClasses) classes = JSON.parse(cachedClasses);
        if (cachedExams) exams = JSON.parse(cachedExams);
        if (cachedTasks) tasks = JSON.parse(cachedTasks);
        
        updateAllViews();
    } catch (e) { console.error('Error loading cache', e); }

    showLoader();
    // Fetch from Supabase in background
    await Promise.all([
        fetchClasses(),
        fetchExams(),
        fetchTasks(),
        fetchPlannerSchedule(),
        fetchGlobalPlannerCourses()
    ]);
    hideLoader();
    
    // Banner logic
    const banner = document.getElementById('download-banner');
    const isNative = window.Capacitor && window.Capacitor.getPlatform() !== 'web';
    if (banner && localStorage.getItem('bannerDismissed') !== 'true' && !isNative) {
        banner.classList.remove('hidden');
    }

    document.getElementById('btn-close-banner')?.addEventListener('click', () => {
        banner.classList.add('hidden');
        localStorage.setItem('bannerDismissed', 'true');
    });

    updateAllViews();
    syncNativeNotifications();
    setInterval(updateTimers, 1000);
    setInterval(checkReminders, 30000);
    setInterval(syncNativeNotifications, 10 * 60 * 1000); // Sync every 10 mins

    // Initial permission check
    if (localStorage.getItem('notifEnabled') === 'true') {
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
        if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
            const { LocalNotifications } = window.Capacitor.Plugins;
            LocalNotifications.checkPermissions().then(status => {
                if (status.display !== 'granted') LocalNotifications.requestPermissions();
            });
        }
    }
}

async function fetchClasses() {
    if (!db) return;
    try {
        const { data, error } = await db.from('classes').select('*').eq('user_id', userKey);
        if (!error) {
            classes = data || [];
            localStorage.setItem(`classes_${userKey}`, JSON.stringify(classes));
        }
    } catch(e) { console.error(e); }
}

async function fetchExams() {
    if (!db) return;
    try {
        const { data, error } = await db.from('exams').select('*').eq('user_id', userKey);
        if (!error) {
            exams = data || [];
            localStorage.setItem(`exams_${userKey}`, JSON.stringify(exams));
        }
    } catch(e) { console.error(e); }
}

async function fetchTasks() {
    if (!db) return;
    try {
        const { data, error } = await db.from('tasks').select('*').eq('user_id', userKey);
        if (!error) {
            tasks = data || [];
            localStorage.setItem(`tasks_${userKey}`, JSON.stringify(tasks));
        }
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
    document.getElementById('fab-search-add')?.addEventListener('click', () => {
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
    const manualSyncBtn = document.getElementById('btn-sync-global-exams');
    if (manualSyncBtn) {
        manualSyncBtn.addEventListener('click', async () => {
            const oldText = manualSyncBtn.innerHTML;
            manualSyncBtn.disabled = true;
            manualSyncBtn.innerHTML = '<span class="sync-icon spinning">🔄</span> Syncing...';
            try {
                await checkGlobalExams();
                setTimeout(() => {
                    const modal = document.getElementById('modal-sync-prompt');
                    if (!modal || modal.classList.contains('hidden')) {
                        showToast('No new exams found for your courses.');
                    }
                }, 1000);
            } catch (e) {
                console.error(e);
                showToast('Sync error. Please try again.');
            } finally {
                setTimeout(() => {
                    manualSyncBtn.disabled = false;
                    manualSyncBtn.innerHTML = oldText;
                }, 1000);
            }
        });
    }
}

window.addCourseToPlanner = async function(idx) {
    const course = window._tempPlannerResults[idx];
    if (!course) return;
    
    // Check for clash
    const dayArr = Array.isArray(course.schedules) ? course.schedules : [];
    for(const s of dayArr) {
        const clash = checkClash(s.day, s.start, s.end, plannerSchedule);
        if(clash) {
            if(!confirm(`Clash detected with ${clash.course_title} on ${s.day}. Add anyway?`)) return;
        }
    }

    showLoader();
    const inserts = dayArr.map(s => ({
        user_id: userKey,
        course_title: course.title,
        course_code: course.code,
        section: course.section,
        day: s.day,
        start_time: s.start,
        end_time: s.end
    }));

    try {
        const { data, error } = await db.from('planner_schedule').insert(inserts).select();
        if(!error) {
            plannerSchedule.push(...data);
            renderPlanner();
            showToast('Added to planner');
            document.getElementById('planner-search-input').value = '';
            document.getElementById('planner-search-results').innerHTML = '';
            document.getElementById('btn-clear-planner-search').classList.add('hidden');
        }
    } catch(e) { console.error(e); }
    hideLoader();
};function setupModals() {
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

    const toggleNotif = document.getElementById('toggle-notifications');
    const reminderSelect = document.getElementById('reminder-minutes');
    const testNotifBtn = document.getElementById('btn-test-notif');

    if (toggleNotif) {
        toggleNotif.checked = localStorage.getItem('notifEnabled') === 'true';
        toggleNotif.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('notifEnabled', enabled);
            
            if (enabled) {
                if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    showToast('Notifications ' + permission);
                }
                
                // Capacitor Local Notifications permission
                if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    const status = await LocalNotifications.requestPermissions();
                    showToast('Native Notif: ' + status.display);
                }
            } else {
                showToast('Notifications disabled');
            }
        });
    }

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
                
                // Cache immediately after import
                localStorage.setItem(`classes_${userKey}`, JSON.stringify(classes));
                localStorage.setItem(`exams_${userKey}`, JSON.stringify(exams));
                localStorage.setItem(`tasks_${userKey}`, JSON.stringify(tasks));
                
                updateAllViews();
                syncNativeNotifications();
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

    // CLEAR ALL SHORTCUTS
    document.getElementById('btn-clear-all-classes-shortcut')?.addEventListener('click', async () => {
        if(confirm("Are you sure you want to delete ALL classes?")) {
            showLoader();
            await db.from('classes').delete().eq('user_id', userKey);
            classes = []; updateAllViews(); hideLoader();
            showToast('All classes cleared');
        }
    });
    document.getElementById('btn-clear-all-tasks-shortcut')?.addEventListener('click', async () => {
        if(confirm("Are you sure you want to delete ALL tasks?")) {
            showLoader();
            await db.from('tasks').delete().eq('user_id', userKey);
            tasks = []; updateAllViews(); hideLoader();
            showToast('All tasks cleared');
        }
    });
    document.getElementById('btn-clear-all-exams-shortcut')?.addEventListener('click', async () => {
        if(confirm("Are you sure you want to delete ALL exams?")) {
            showLoader();
            await db.from('exams').delete().eq('user_id', userKey);
            exams = []; updateAllViews(); hideLoader();
            showToast('All exams cleared');
        }
    });
    document.getElementById('btn-clear-planner-shortcut')?.addEventListener('click', async () => {
        if(confirm("Are you sure you want to clear your entire PLAN?")) {
            showLoader();
            await db.from('planner_schedule').delete().eq('user_id', userKey);
            plannerSchedule = []; renderPlanner(); hideLoader();
            showToast('Plan cleared');
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
        const remind = document.getElementById('f-notif').checked;
        const activeDays = Array.from(document.querySelectorAll('.day-pill.active')).map(p => p.dataset.day);
        
        if (activeDays.length === 0) { showToast('Please select at least one day.'); return; }
        
        // Optimistic UI
        const tempId = 'temp_' + Date.now();
        const newClasses = activeDays.map(day => ({ 
            id: tempId + Math.random(), 
            user_id: userKey, 
            course, start_time, end_time, day, type, room, remind,
            isTemp: true 
        }));
        
        classes.push(...newClasses);
        updateAllViews();
        localStorage.setItem(`classes_${userKey}`, JSON.stringify(classes.filter(c => !c.isTemp))); // Cache non-temp only for safety
        
        document.getElementById('manual-class-form').reset();
        document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
        document.getElementById('nav-schedule').click();
        showToast('Class added!');

        // Background Sync
        const inserts = activeDays.map(day => ({ user_id: userKey, course, start_time, end_time, day, type, room, remind }));
        const { data, error } = await db.from('classes').insert(inserts).select();
        
        if (!error) {
            // Replace temp classes with real ones
            classes = classes.filter(c => !newClasses.find(nc => nc.id === c.id));
            classes.push(...data);
            localStorage.setItem(`classes_${userKey}`, JSON.stringify(classes));
            updateAllViews();
            syncNativeNotifications();
        } else { 
            console.error(error);
            showToast("Sync error, but class saved locally."); 
        }
    });

    document.getElementById('manual-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const course = document.getElementById('e-course').value;
        const date = document.getElementById('e-date').value;
        const time = document.getElementById('e-time').value;
        const notes = document.getElementById('e-notes').value;
        const remind = document.getElementById('e-notif').checked;
        
        // Optimistic
        const tempExam = { id: 'temp_' + Date.now(), user_id: userKey, course, date, time, notes, remind, isTemp: true };
        exams.push(tempExam);
        updateAllViews();
        localStorage.setItem(`exams_${userKey}`, JSON.stringify(exams.filter(ex => !ex.isTemp)));

        document.getElementById('manual-exam-form').reset();
        document.getElementById('nav-exams').click();
        showToast('Exam added!');

        // Sync
        const { data, error } = await db.from('exams').insert([{ user_id: userKey, course, date, time, notes, remind }]).select();
        if (!error) {
            exams = exams.filter(ex => ex.id !== tempExam.id);
            exams.push(data[0]);
            localStorage.setItem(`exams_${userKey}`, JSON.stringify(exams));
            updateAllViews();
            syncNativeNotifications();
        } else { showToast("Sync error, saved locally"); }
    });

    document.getElementById('manual-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('t-title').value;
        const date = document.getElementById('t-date').value;
        const time = document.getElementById('t-time').value;
        const remind = document.getElementById('t-notif').checked;
        
        // Optimistic
        const tempTask = { id: 'temp_' + Date.now(), user_id: userKey, title, date, time, remind, isTemp: true };
        tasks.push(tempTask);
        updateAllViews();
        localStorage.setItem(`tasks_${userKey}`, JSON.stringify(tasks.filter(t => !t.isTemp)));

        document.getElementById('manual-task-form').reset();
        document.getElementById('nav-exams').click();
        showToast('Task added!');

        // Sync
        const { data, error } = await db.from('tasks').insert([{ user_id: userKey, title, date, time, remind }]).select();
        if (!error) {
            tasks = tasks.filter(t => t.id !== tempTask.id);
            tasks.push(data[0]);
            localStorage.setItem(`tasks_${userKey}`, JSON.stringify(tasks));
            updateAllViews();
            syncNativeNotifications();
        } else { showToast("Sync error, saved locally"); }
    });

    document.getElementById('edit-class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-class-id').value;
        const course = document.getElementById('ec-course').value;
        const start_time = document.getElementById('ec-start').value;
        const end_time = document.getElementById('ec-end').value;
        const type = document.getElementById('ec-type').value;
        const room = document.getElementById('ec-room').value;
        const remind = document.getElementById('ec-notif').checked;

        showLoader();
        const { data, error } = await db.from('classes').update({ course, start_time, end_time, type, room, remind }).eq('id', id).select();
        if (!error) {
            const idx = classes.findIndex(c => c.id == id);
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
        const remind = document.getElementById('ex-notif').checked;

        showLoader();
        const { data, error } = await db.from('exams').update({ course, date, time, notes, remind }).eq('id', id).select();
        if (!error) {
            const idx = exams.findIndex(ex => ex.id == id);
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
        const remind = document.getElementById('et-notif').checked;

        showLoader();
        const { data, error } = await db.from('tasks').update({ title, date, time, remind }).eq('id', id).select();
        if (!error) {
            const idx = tasks.findIndex(t => t.id == id);
            if(idx > -1) tasks[idx] = data[0];
            updateAllViews(); 
            syncNativeNotifications();
            document.getElementById('modal-edit-task').classList.add('hidden');
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
    const cls = classes.find(c => c.id == id);
    if(!cls) return;
    document.getElementById('edit-class-id').value = cls.id;
    document.getElementById('ec-course').value = cls.course;
    document.getElementById('ec-start').value = cls.start_time;
    document.getElementById('ec-end').value = cls.end_time;
    document.getElementById('ec-type').value = cls.type;
    document.getElementById('ec-room').value = cls.room;
    document.getElementById('ec-notif').checked = cls.remind !== false;
    document.getElementById('modal-edit-class').classList.remove('hidden');
};

window.deleteClass = async function(id) {
    const idx = classes.findIndex(c => c.id == id);
    if(idx === -1) return;
    if(!confirm("Delete this class?")) return;
    
    const deleted = classes[idx];
    // Optimistic Update
    classes.splice(idx, 1); 
    updateAllViews();
    
    const { error } = await db.from('classes').delete().eq('id', id);
    if (!error) {
        showUndo('Class deleted', 'class', deleted, idx);
    } else {
        // Rollback if failed
        classes.splice(idx, 0, deleted);
        updateAllViews();
        showToast('Error deleting class.');
    }
};

window.editExam = function(id) {
    const ex = exams.find(e => e.id == id);
    if(!ex) return;
    document.getElementById('edit-exam-id').value = ex.id;
    document.getElementById('ee-course').value = ex.course;
    document.getElementById('ee-date').value = ex.date;
    document.getElementById('ee-time').value = ex.time;
    document.getElementById('ee-notes').value = ex.notes || '';
    document.getElementById('ex-notif').checked = ex.remind !== false;
    document.getElementById('modal-edit-exam').classList.remove('hidden');
};

window.deleteExam = async function(id) {
    const idx = exams.findIndex(e => e.id == id);
    if(idx === -1) return;
    if(!confirm("Delete this exam?")) return;

    const deleted = exams[idx];
    // Optimistic Update
    exams.splice(idx, 1);
    updateAllViews();

    const { error } = await db.from('exams').delete().eq('id', id);
    if (!error) {
        showUndo('Exam deleted', 'exam', deleted, idx);
    } else {
        // Rollback
        exams.splice(idx, 0, deleted);
        updateAllViews();
        showToast('Error deleting exam.');
    }
};

window.editTask = function(id) {
    console.log('editTask called with id:', id);
    if(!id) { console.error('No ID provided to editTask'); return; }
    const t = tasks.find(x => x.id == id);
    if(!t) { console.error('Task not found for id:', id); return; }
    
    const modal = document.getElementById('modal-edit-task');
    if(!modal) { console.error('modal-edit-task not found in DOM'); return; }

    document.getElementById('edit-task-id').value = t.id;
    document.getElementById('et-title').value = t.title || '';
    document.getElementById('et-date').value = t.date || '';
    document.getElementById('et-time').value = t.time || '';
    document.getElementById('et-notif').checked = t.remind !== false;
    modal.classList.remove('hidden');
};

window.deleteTask = async function(id) {
    console.log('deleteTask called with id:', id);
    if(!id) return;
    const idx = tasks.findIndex(x => x.id == id);
    if(idx === -1) { console.error('Task not found for deletion:', id); return; }
    if(!confirm("Delete this task?")) return;

    const deleted = tasks[idx];
    // Optimistic Update
    tasks.splice(idx, 1);
    updateAllViews();

    if (!db) { showToast('Database connection missing'); return; }

    try {
        const { error } = await db.from('tasks').delete().eq('id', id);
        if (!error) {
            showUndo('Task deleted', 'task', deleted, idx);
            await syncNativeNotifications();
        } else {
            console.error('Supabase delete error:', error);
            // Rollback
            tasks.splice(idx, 0, deleted);
            updateAllViews();
            showToast('Error deleting task: ' + error.message);
        }
    } catch (e) {
        console.error('Delete task exception:', e);
        tasks.splice(idx, 0, deleted);
        updateAllViews();
    }
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
                        <div class="class-card-name">${cls.course}${cls.section ? ' [' + cls.section + ']' : ''}</div>
                        <div class="class-card-meta">Room ${cls.room || 'TBA'} | ${cls.type}</div>
                    </div>
                    <div class="class-card-time">
                        <div id="card-timer-${cls.id}" style="font-size:0.7rem; font-weight:700; color:var(--primary); margin-bottom:2px;"></div>
                        <span class="class-card-time-start">${convertTo12Hour(cls.start_time)}</span>
                        <span class="class-card-time-end">to ${convertTo12Hour(cls.end_time)}</span>
                    </div>
                </div>`;
        });
        todayScheduleCont.innerHTML = html;
    }
}function updateTimers() {
    const now = new Date();
    const todayStr = DAYS_OF_WEEK[now.getDay()];

    // Update Individual Class Card Timers
    classes.forEach(cls => {
        const timerEl = document.getElementById(`card-timer-${cls.id}`);
        if (!timerEl) return;

        if (cls.day !== todayStr) {
            timerEl.textContent = "";
            return;
        }

        const start = new Date(now);
        const [sh, sm] = cls.start_time.split(':').map(Number);
        start.setHours(sh, sm, 0, 0);

        const end = new Date(now);
        const [eh, em] = cls.end_time.split(':').map(Number);
        end.setHours(eh, em, 0, 0);

        if (now < start) {
            const diff = start - now;
            timerEl.textContent = "Starts in " + formatDuration(diff);
            timerEl.style.color = "var(--primary)";
        } else if (now >= start && now <= end) {
            const diff = end - now;
            timerEl.textContent = "Ends in " + formatDuration(diff);
            timerEl.style.color = "var(--accent)";
        } else {
            timerEl.textContent = "Finished";
            timerEl.style.color = "var(--text3)";
        }
    });

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
            syncNativeNotifications();
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

async function syncNativeNotifications() {
    try {
        if (localStorage.getItem('notifEnabled') !== 'true') return;
        if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) return;

        const { LocalNotifications } = window.Capacitor.Plugins;
    
    // Clear existing notifications
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
    }

    const now = new Date();
    const notifications = [];
    let id = 1;

    // Schedule Classes for the next 7 days
    classes.forEach(cls => {
        if (cls.remind === false) return;
        for (let i = 0; id < 50 && i < 7; i++) {
            const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
            const dayName = DAYS_OF_WEEK[date.getDay()];
            if (cls.day === dayName) {
                const [h, m] = cls.start_time.split(':').map(Number);
                const scheduledTime = new Date(date);
                scheduledTime.setHours(h, m, 0, 0);
                const triggerTime = new Date(scheduledTime.getTime() - reminderLeadTime * 60 * 1000);
                
                if (triggerTime > now) {
                    notifications.push({
                        title: 'Class Reminder',
                        body: `Upcoming: ${cls.course} at ${convertTo12Hour(cls.start_time)}`,
                        id: id++,
                        schedule: { at: triggerTime }
                    });
                }
            }
        }
    });

    // Schedule Exams
    exams.forEach(ex => {
        if (ex.remind === false) return;
        const scheduledTime = new Date(ex.date + 'T' + ex.time);
        const triggerTime = new Date(scheduledTime.getTime() - reminderLeadTime * 60 * 1000);
        if (triggerTime > now && id < 60) {
            notifications.push({
                title: 'Exam Reminder',
                body: `Upcoming Exam: ${ex.course} at ${convertTo12Hour(ex.time)}`,
                id: id++,
                schedule: { at: triggerTime }
            });
        }
    });

    // Schedule Tasks
    tasks.forEach(t => {
        if (t.remind === false) return;
        const scheduledTime = new Date(t.date + 'T' + t.time);
        const triggerTime = new Date(scheduledTime.getTime() - reminderLeadTime * 60 * 1000);
        if (triggerTime > now && id < 80) {
            notifications.push({
                title: 'Task Reminder',
                body: `Upcoming Task: ${t.title} at ${convertTo12Hour(t.time)}`,
                id: id++,
                schedule: { at: triggerTime }
            });
        }
    });

    if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
    }
    } catch (e) {
        console.warn('Native notification sync failed:', e);
    }
}

function checkReminders() {
    if (localStorage.getItem('notifEnabled') !== 'true') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    const now = new Date();
    const leadMs = reminderLeadTime * 60 * 1000;
    
    classes.forEach(cls => {
        const diff = getNextOccurrenceOfClass(cls, now) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) {
            new Notification('Class Reminder', { body: 'Upcoming class: ' + cls.course + ' at ' + convertTo12Hour(cls.start_time) + ' (Room ' + cls.room + ')' });
        }
    });
    exams.forEach(ex => {
        const diff = new Date(ex.date + 'T' + ex.time) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) {
            new Notification('Exam Reminder', { body: 'Upcoming exam: ' + ex.course + ' at ' + convertTo12Hour(ex.time) });
        }
    });
    tasks.forEach(t => {
        const diff = new Date(t.date + 'T' + t.time) - now;
        if (diff > 0 && diff <= leadMs && diff > (leadMs - 30000)) {
            new Notification('Task Reminder', { body: 'Upcoming task: ' + t.title + ' at ' + convertTo12Hour(t.time) });
        }
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
    
    const oldPlan = [...plannerSchedule];
    // Optimistic Update
    plannerSchedule = plannerSchedule.filter(s => s.id !== id);
    renderPlanner();
    
    const { error } = await db.from('planner_schedule').delete().eq('id', id);
    if (error) {
        plannerSchedule = oldPlan;
        renderPlanner();
        showToast('Error removing course.');
    } else {
        showToast('Course removed.');
    }
};

/** ===== ADMIN & SYNC FUNCTIONS ===== **/

function setupAdminPanel() {
    const fileInput = document.getElementById('admin-exam-upload');
    const processBtn = document.getElementById('btn-admin-process');
    const status = document.getElementById('admin-exam-status');
    const resultsDiv = document.getElementById('admin-results');

    const handleSync = async (exams, type, rows = []) => {
        if (!exams || exams.length === 0) {
            if (status) status.textContent = 'No exams found. Check file format.';
            if (resultsDiv) {
                resultsDiv.classList.remove('hidden');
                resultsDiv.innerHTML = `<div style="color:var(--pink); font-weight:700; margin-bottom:8px;">Debug: No matches in ${rows.length} rows.</div>` + 
                    rows.slice(0, 15).map(r => `<div style="border-bottom:1px solid var(--border); padding:4px; font-family:monospace; font-size:0.7rem;">${JSON.stringify(r)}</div>`).join('');
            }
            return;
        }
        
        if (status) status.textContent = `Found ${exams.length} exams. Syncing...`;
        if (resultsDiv) resultsDiv.classList.add('hidden');
        
        await db.from('global_exams').delete().neq('id', 0);
        for (let i = 0; i < exams.length; i += 500) {
            const { error } = await db.from('global_exams').insert(exams.slice(i, i+500).map(e => ({...e, exam_type: type})));
            if (error) throw error;
        }
        if (status) status.textContent = `✅ Successfully synced ${exams.length} exams!`;
    };

    // 1. EXCEL/CSV SYNC
    if (processBtn) {
        processBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const file = fileInput?.files[0];
            if (!file) { showToast('Please select a file.'); return; }
            showLoader();
            try {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                const exams = parseExamExcelJSON(rows);
                const examType = document.getElementById('admin-exam-type')?.value || '';
                await handleSync(exams, examType, rows);
                
                // Immediately check for matches for the current user
                checkGlobalExams();
            } catch (err) {
                console.error(err);
                if (status) status.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    // 2. PASTE MODE SYNC
    const pasteBtn = document.getElementById('btn-admin-paste-process');
    const pasteArea = document.getElementById('admin-exam-paste');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const text = pasteArea?.value?.trim();
            if (!text) { showToast('Please paste some text.'); return; }
            showLoader();
            try {
                const rows = text.split('\n').map(l => l.trim().split(/\s{2,}|\t/)).filter(r => r.length > 0);
                const exams = parseExamExcelJSON(rows);
                const examType = document.getElementById('admin-exam-type')?.value || '';
                await handleSync(exams, examType, rows);
                
                if (exams.length > 0) {
                    if (pasteArea) pasteArea.value = '';
                    checkGlobalExams(); // Trigger user sync check
                }
            } catch (err) {
                if (status) status.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    // 3. CATALOG SYNC
    const catalogBtn = document.getElementById('btn-admin-catalog-process');
    const catalogFile = document.getElementById('admin-catalog-file');
    const catalogStatus = document.getElementById('admin-catalog-status');
    if (catalogBtn) {
        catalogBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const file = catalogFile?.files[0];
            if (!file) { showToast('Select catalog file.'); return; }
            showLoader();
            try {
                const arrayBuffer = await file.arrayBuffer();
                let courses = [];
                if (file.name.endsWith('.csv')) {
                    courses = parsePlannerCSV(new TextDecoder().decode(arrayBuffer));
                } else {
                    const json = XLSX.utils.sheet_to_json(XLSX.read(arrayBuffer, { type: 'array' }).Sheets[0]);
                    courses = parsePlannerJSON(json);
                }
                await db.from('global_classes').delete().neq('id', 0);
                for (let i = 0; i < courses.length; i += 500) {
                    await db.from('global_classes').insert(courses.slice(i, i+500));
                }
                if (catalogStatus) catalogStatus.textContent = `✅ Synced ${courses.length} courses!`;
                loadProjectCSV();
            } catch(err) {
                if (catalogStatus) catalogStatus.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    // 4. PLANNER TEMPLATE SYNC
    const plannerBtn = document.getElementById('btn-admin-planner-process');
    const plannerFile = document.getElementById('admin-planner-file');
    const plannerStatus = document.getElementById('admin-planner-status');
    if (plannerBtn) {
        plannerBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const file = plannerFile?.files[0];
            if (!file) return;
            showLoader();
            try {
                const arrayBuffer = await file.arrayBuffer();
                let courses = [];
                if (file.name.endsWith('.csv')) {
                    courses = parsePlannerCSV(new TextDecoder().decode(arrayBuffer));
                } else {
                    courses = parsePlannerJSON(XLSX.utils.sheet_to_json(XLSX.read(arrayBuffer, { type: 'array' }).Sheets[0]));
                }
                await db.from('global_planner_courses').delete().neq('id', 0);
                for (let i = 0; i < courses.length; i += 500) {
                    await db.from('global_planner_courses').insert(courses.slice(i, i+500));
                }
                if (plannerStatus) plannerStatus.textContent = `✅ Synced ${courses.length} courses!`;
            } catch(err) {
                if (plannerStatus) plannerStatus.textContent = 'Error: ' + err.message;
            }
            hideLoader();
        });
    }

    // 5. CLEANUP ACTIONS
    const clearTable = async (table, label) => {
        if (!confirm(`Are you sure you want to PERMANENTLY delete all ${label}?`)) return;
        showLoader();
        try {
            const { error } = await db.from(table).delete().neq('id', 0);
            if (error) throw error;
            showToast(`${label} cleared successfully.`);
        } catch (err) {
            showToast(`Error: ` + err.message);
        }
        hideLoader();
    };

    document.getElementById('btn-clear-exams')?.addEventListener('click', () => clearTable('global_exams', 'Exams'));
    document.getElementById('btn-clear-classes')?.addEventListener('click', () => clearTable('global_classes', 'Course Catalog'));
    document.getElementById('btn-clear-planner')?.addEventListener('click', () => clearTable('global_planner_courses', 'Planner Template'));
    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
        if (!confirm('💥 WARNING: This will delete ALL global data. Proceed?')) return;
        showLoader();
        try {
            await Promise.all([
                db.from('global_exams').delete().neq('id', 0),
                db.from('global_classes').delete().neq('id', 0),
                db.from('global_planner_courses').delete().neq('id', 0)
            ]);
            showToast('All global data cleared.');
        } catch (err) {
            showToast('Error: ' + err.message);
        }
        hideLoader();
    });
}

function parseExamExcelJSON(rows) {
    const results = [];
    let currentDate = null;
    let currentTime = null;
    let currentVenue = '';
    
    const dateRegex = /([A-Za-z]+ \d{1,2},\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i;
    const timeRangeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i;
    const singleTimeRegex = /^(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
    const slotRegex = /Slot\s*(\d+)/i;
    const venueKeywords = ['ANNEX', 'BUILDING', 'ROOM', 'DSK', 'CAMPUS', 'LAB', 'ARCH', 'AUDITORIUM'];
    
    const slotTimes = {
        '1': '9:00 AM - 11:00 AM',
        '2': '12:00 PM - 2:00 PM',
        '3': '3:00 PM - 5:00 PM'
    };

    // Flatten rows
    const cleanRows = rows.map(r => Array.isArray(r) ? r.map(v => v ? String(v).trim() : '') : [String(r).trim()])
                          .filter(r => r.some(v => v));

    for (let i = 0; i < cleanRows.length; i++) {
        const row = cleanRows[i];
        const rowText = row.join(' ');
        const upperRow = rowText.toUpperCase();

        // 1. Detect Date (Don't continue if it's a long row)
        const dateMatch = rowText.match(dateRegex);
        if (dateMatch) {
            try { currentDate = new Date(dateMatch[1]).toISOString().split('T')[0]; } catch(e) {}
        }

        // 2. Detect Slot or Time
        const slotMatch = rowText.match(slotRegex);
        if (slotMatch) {
            currentTime = slotTimes[slotMatch[1]] || `Slot ${slotMatch[1]}`;
        } else {
            const timeRangeMatch = rowText.match(timeRangeRegex);
            if (timeRangeMatch) {
                currentTime = timeRangeMatch[1] + ' - ' + timeRangeMatch[2];
            } else if (singleTimeRegex.test(rowText)) {
                currentTime = rowText;
            }
        }

        // 3. Detect Venue Header
        if (row.length === 1 && (venueKeywords.some(k => upperRow.includes(k)) || upperRow === 'ALL')) {
            currentVenue = upperRow;
            continue;
        }

        // 4. Skip Headers
        if (upperRow.includes('COURSE TITLE') || upperRow.includes('TIME/SLOT')) continue;

        // 5. Process Course Row
        if (currentDate && currentTime) {
            let courseName = '';
            let sections = '';
            let rowVenue = currentVenue;

            // EXCEL TABULAR FORMAT DETECTION
            if (row.length >= 5) {
                // [Date, Time, Course, Sections, Venue]
                courseName = row[2];
                sections = row[3];
                rowVenue = row[4] || currentVenue;
            } else {
                // PDF / MESSY TEXT DETECTION
                const sectionSplitMatch = rowText.match(/^(.*?)\s+([A-Z\d,]{1,}(?:,.*)?|All)$/i);
                if (sectionSplitMatch) {
                    courseName = sectionSplitMatch[1].trim();
                    sections = sectionSplitMatch[2].trim();
                } else {
                    courseName = rowText.trim();
                }

                // Peer ahead for merged sections
                while (i + 1 < cleanRows.length) {
                    const nextRowArr = cleanRows[i + 1];
                    const nextRowStr = nextRowArr.join(' ');
                    const isContinuation = nextRowStr.startsWith(',') || 
                                           (nextRowArr.length === 1 && !nextRowStr.includes(' ') && nextRowStr.includes(',')) ||
                                           (nextRowStr.length < 50 && /^[A-Z\d, ]+$/.test(nextRowStr) && !venueKeywords.some(k => nextRowStr.toUpperCase().includes(k)));
                    
                    if (isContinuation) {
                        sections += (sections.endsWith(',') ? '' : ',') + nextRowStr;
                        i++;
                    } else {
                        break;
                    }
                }
            }

            // Cleanup Course Name (remove Date/Time if they got stuck to it)
            courseName = courseName.replace(dateRegex, '').replace(timeRangeRegex, '').replace(slotRegex, '').trim();

            if (courseName.length > 3 && !courseName.toUpperCase().includes('COURSE TITLE')) {
                results.push({
                    exam_date: currentDate,
                    time: currentTime,
                    course: courseName,
                    sections: sections || 'All',
                    venue: rowVenue || 'TBA'
                });
            }
        }
    }
    
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

        const { data: existingExams } = await db.from('exams').select('course').eq('user_id', userKey);
        const existingTitles = new Set((existingExams || []).map(e => e.course));

        // console.log(`Checking sync: ${myClasses.length} local classes, ${globalExams.length} global exams.`);

        const cleanStr = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        const toSync = [];
        myClasses.forEach(cls => {
            const cleanCls = cleanStr(cls.course);
            
            globalExams.forEach(ge => {
                if (!ge.course) return;
                const cleanGe = cleanStr(ge.course);
                
                // Match if names are similar
                const titleMatch = cleanGe.includes(cleanCls) || cleanCls.includes(cleanGe);
                
                if (titleMatch) {
                    const title = `${ge.course}${ge.exam_type ? ' (' + ge.exam_type + ')' : ''}`;
                    if (!existingTitles.has(title)) {
                        existingTitles.add(title);
                        toSync.push({
                            user_id: userKey,
                            course: title,
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

function initNotifToggle() {
    const btn = document.getElementById('btn-toggle-notifs');
    if (!btn) return;

    const updateUI = () => {
        const enabled = localStorage.getItem('notifEnabled') === 'true';
        if (enabled) {
            btn.classList.add('active');
            btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M10 2a6 6 0 0 0-6 6v3.5l-1.5 2h15L16 11.5V8a6 6 0 0 0-6-6zM8 15a2 2 0 0 0 4 0"/></svg>';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="18" height="18"><path d="M10 2a6 6 0 0 0-6 6v3.5l-1.5 2h15L16 11.5V8a6 6 0 0 0-6-6zM8 15a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }
    };

    updateUI();

    btn.addEventListener('click', async () => {
        const currentlyEnabled = localStorage.getItem('notifEnabled') === 'true';
        if (!currentlyEnabled) {
            if (window.Capacitor) {
                const { LocalNotifications } = window.Capacitor.Plugins;
                const perm = await LocalNotifications.requestPermissions();
                if (perm.display !== 'granted') {
                    showToast('Notification permission denied');
                    return;
                }
            }
            localStorage.setItem('notifEnabled', 'true');
            showToast('Notifications enabled');
            syncNativeNotifications();
        } else {
            localStorage.setItem('notifEnabled', 'false');
            showToast('Notifications disabled');
            if (window.Capacitor) {
                const { LocalNotifications } = window.Capacitor.Plugins;
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }
            }
        }
        updateUI();
    });
}

function initNotifToggle() {
    const btn = document.getElementById('btn-toggle-notifs');
    if (!btn) return;

    const updateUI = () => {
        const enabled = localStorage.getItem('notifEnabled') === 'true';
        if (enabled) {
            btn.classList.add('active');
            btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M10 2a6 6 0 0 0-6 6v3.5l-1.5 2h15L16 11.5V8a6 6 0 0 0-6-6zM8 15a2 2 0 0 0 4 0"/></svg>';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="18" height="18"><path d="M10 2a6 6 0 0 0-6 6v3.5l-1.5 2h15L16 11.5V8a6 6 0 0 0-6-6zM8 15a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }
        
        // Sync the settings toggle if it exists
        const settingsToggle = document.getElementById('toggle-notifications');
        if (settingsToggle) settingsToggle.checked = enabled;
    };

    updateUI();

    btn.addEventListener('click', async () => {
        const currentlyEnabled = localStorage.getItem('notifEnabled') === 'true';
        if (!currentlyEnabled) {
            if (window.Capacitor) {
                const { LocalNotifications } = window.Capacitor.Plugins;
                const perm = await LocalNotifications.requestPermissions();
                if (perm.display !== 'granted') {
                    showToast('Notification permission denied');
                    return;
                }
            }
            localStorage.setItem('notifEnabled', 'true');
            showToast('Notifications enabled');
            syncNativeNotifications();
        } else {
            localStorage.setItem('notifEnabled', 'false');
            showToast('Notifications disabled');
            if (window.Capacitor) {
                const { LocalNotifications } = window.Capacitor.Plugins;
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel(pending);
                }
            }
        }
        updateUI();
    });
}

function setupNotificationSettings() {
    const reminderSelect = document.getElementById('reminder-minutes');
    if (reminderSelect) {
        reminderSelect.value = reminderLeadTime;
        reminderSelect.addEventListener('change', (e) => {
            reminderLeadTime = parseInt(e.target.value);
            localStorage.setItem('reminderLeadTime', reminderLeadTime);
            showToast(`Reminders set to ${reminderLeadTime}m before.`);
            syncNativeNotifications();
        });
    }

    const testNotifBtn = document.getElementById('btn-test-notif');
    if (testNotifBtn) {
        testNotifBtn.addEventListener('click', async () => {
            if (localStorage.getItem('notifEnabled') !== 'true') {
                showToast('Please enable notifications first');
                return;
            }
            showToast('Test notification scheduled in 10s...');
            if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
                const { LocalNotifications } = window.Capacitor.Plugins;
                await LocalNotifications.schedule({
                    notifications: [{
                        title: 'Test Reminder 🔔',
                        body: 'This is how your class reminders will look! It works even if the app is closed.',
                        id: 999,
                        schedule: { at: new Date(Date.now() + 10000) },
                        channelId: 'reminders'
                    }]
                });
            } else if ('Notification' in window && Notification.permission === 'granted') {
                setTimeout(() => {
                    new Notification('Test Reminder 🔔', {
                        body: 'This is how your class reminders will look!'
                    });
                }, 10000);
            }
        });
    }

    const settingsToggle = document.getElementById('toggle-notifications');
    if (settingsToggle) {
        settingsToggle.checked = localStorage.getItem('notifEnabled') === 'true';
        settingsToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('notifEnabled', enabled);
            if (enabled) {
                if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    const perm = await LocalNotifications.requestPermissions();
                    if (perm.display !== 'granted') {
                        showToast('Notification permission denied');
                        e.target.checked = false;
                        localStorage.setItem('notifEnabled', 'false');
                        return;
                    }
                }
                syncNativeNotifications();
                showToast('Notifications enabled');
            } else {
                showToast('Notifications disabled');
                if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    const p = await LocalNotifications.getPending();
                    if (p.notifications.length > 0) await LocalNotifications.cancel(p);
                }
            }
        });
    }
}
