const fs = require('fs');
const path = 'main.js';
let content = fs.readFileSync(path, 'utf8');

// Restore missing parts and apply fixes
// 1. Restore Auth initialization
const authSearch = "initNotifToggle();\n    setupNotificationSettings();";
const authReplace = `initNotifToggle();
    setupNotificationSettings();
    if (window.supabase) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        loadProjectCSV();
        setupAuthOverlay();

        // Check active session
        const checkAuth = async () => {
            const { data: { session }, error } = await db.auth.getSession();
            if (session) {
                handleLoginSuccess(session.user);
            } else {
                const cachedUser = localStorage.getItem('classify_cached_user');
                if (cachedUser) handleLoginSuccess(JSON.parse(cachedUser), true);
            }
        };
        checkAuth();

        db.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                handleLoginSuccess(session.user);
            } else if (event === 'SIGNED_OUT') {
                userKey = null;
                localStorage.removeItem('classify_cached_user');
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
    }`;

// We need to be careful with the string replacement if the original was already partially modified
// I'll use a more robust regex or just find the surrounding anchors.

console.log('Original content length:', content.length);

// Fix handleLoginSuccess
content = content.replace(/function handleLoginSuccess\(user\) \{([\s\S]+?)initApp\(\);/g, 
    "function handleLoginSuccess(user, isSilent = false) {\n    userKey = user.id;\n    localStorage.setItem('classify_cached_user', JSON.stringify(user));\n$1initApp(isSilent);");

// Fix initApp
content = content.replace(/async function initApp\(\) \{([\s\S]+?)showLoader\(\);/g,
    "async function initApp(isSilent = false) {\n$1if (!isSilent) showLoader();");

// Fix tasks fetch mapping
content = content.replace(/if \(!error\) \{\n\s+tasks = data \|\| \[\];\n\s+localStorage\.setItem\(`tasks_\${userKey}`, JSON\.stringify\(tasks\)\);\n\s+\}/g,
    "if (!error) {\n            tasks = (data || []).map(t => ({ ...t, title: t.title || t.course }));\n            localStorage.setItem(`tasks_${userKey}`, JSON.stringify(tasks));\n            updateAllViews();\n        }");

fs.writeFileSync(path, content);
console.log('Patched main.js');
