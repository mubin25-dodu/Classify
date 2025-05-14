const classes = JSON.parse(localStorage.getItem('classes')) || []; // Load routine from localStorage or start with an empty array

function saveClassesToLocalStorage() {
    localStorage.setItem('classes', JSON.stringify(classes));
}

function renderRoutine() {
    const routineContainer = document.querySelector('.routine-container');
    routineContainer.innerHTML = ''; // Clear existing routine

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayIndex = new Date().getDay();

    // Reorder days to start with today
    const orderedDays = [...daysOfWeek.slice(todayIndex), ...daysOfWeek.slice(0, todayIndex)];

    orderedDays.forEach(day => {
        const dayClasses = classes.filter(cls => cls.day === day);

        // Sort classes by start time
        dayClasses.sort((a, b) => {
            const [aHour, aMinute] = a.startTime.split(':').map(Number);
            const [bHour, bMinute] = b.startTime.split(':').map(Number);
            return aHour * 60 + aMinute - (bHour * 60 + bMinute);
        });

        if (dayClasses.length > 0) {
            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.innerHTML = `<h3>${day}</h3>`;

            dayClasses.forEach((cls, idx) => {
                const classCard = document.createElement('div');
                classCard.className = 'class-card';
                classCard.innerHTML = `
                    <h4>${cls.course}</h4>
                    <p><b>Time:</b> ${cls.startTime} - ${cls.endTime}</p>
                    <p><b>Room:</b> ${cls.room}</p>
                    <p><b>Type:</b> ${cls.type}</p>
                    <button class='btn btn-warning btn-sm me-2 edit-class-btn'>Edit</button>
                    <button class='btn btn-danger btn-sm delete-class-button'>Delete</button>
                `;
                classCard.querySelector('.edit-class-btn').onclick = () => makeClassCardEditable(classCard, cls, classes.indexOf(cls));
                classCard.querySelector('.delete-class-button').onclick = () => {
                    const idx = classes.indexOf(cls);
                    const deleted = classes.splice(idx, 1)[0];
                    saveClassesToLocalStorage();
                    renderRoutine();
                    showUndoSnackbar('Class', deleted, idx);
                };
                dayColumn.appendChild(classCard);
            });

            routineContainer.appendChild(dayColumn);
        }
    });
}

function getNextClass() {
    const now = new Date();
    const today = now.toLocaleString('en-US', { weekday: 'long' });
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let nextClass = null;
    let minTimeDifference = Infinity;

    classes.forEach(cls => {
        const [startHour, startMinute] = cls.startTime.split(':').map(Number);
        const classTime = startHour * 60 + startMinute;

        if (cls.day === today && classTime > currentTime && classTime - currentTime < minTimeDifference) {
            nextClass = cls;
            minTimeDifference = classTime - currentTime;
        }
    });

    return nextClass;
}

function updateCountdown() {
    const nextClass = getNextClass();
    const countdownElement = document.getElementById('countdown');

    if (!nextClass) {
        countdownElement.textContent = 'No more classes today!';
        return;
    }

    // Only show 'No more classes today!' and do not display next class details
    countdownElement.textContent = '';
}

function updateClassTimers() {
    const timers = document.querySelectorAll('.class-timer');
    const now = new Date();

    timers.forEach(timer => {
        const classTime = timer.getAttribute('data-time');
        const classDay = timer.getAttribute('data-day');
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDayIndex = now.getDay();
        const classDayIndex = daysOfWeek.indexOf(classDay);

        let dayDifference = classDayIndex - currentDayIndex;
        if (dayDifference < 0 || (dayDifference === 0 && isClassOverToday(classTime))) {
            dayDifference += 7; // Move to the next week
        }

        const [hour, minute] = classTime.split(':').map(Number);
        const classDate = new Date(now);
        classDate.setDate(now.getDate() + dayDifference);
        classDate.setHours(hour, minute, 0, 0);

        const diff = classDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timer.textContent = `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds}s`;
    });
}

function isClassOverToday(classTime) {
    const now = new Date();
    const [hour, minute] = classTime.split(':').map(Number);
    const classToday = new Date(now);
    classToday.setHours(hour, minute, 0, 0);

    return now > classToday;
}

function highlightNextClass() {
    const now = new Date();
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIndex = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let nextClassElement = null;
    let minTimeDifference = Infinity;

    document.querySelectorAll('.class-card').forEach(card => {
        const classTime = card.querySelector('.class-timer').getAttribute('data-time');
        const classDay = card.querySelector('.class-timer').getAttribute('data-day');
        const classDayIndex = daysOfWeek.indexOf(classDay);

        let dayDifference = classDayIndex - currentDayIndex;
        if (dayDifference < 0 || (dayDifference === 0 && isClassOverToday(classTime))) {
            dayDifference += 7; // Move to the next week
        }

        const [hour, minute] = classTime.split(':').map(Number);
        const classTimeInMinutes = hour * 60 + minute;
        const totalMinutesUntilClass = dayDifference * 1440 + classTimeInMinutes - currentTime;

        if (totalMinutesUntilClass < minTimeDifference) {
            minTimeDifference = totalMinutesUntilClass;
            nextClassElement = card;
        }
    });

    document.querySelectorAll('.class-card').forEach(card => card.classList.remove('highlight'));

    if (nextClassElement) {
        nextClassElement.classList.add('highlight');
    }
}

function updateExamCountdowns() {
    const now = new Date();
    const examItems = document.querySelectorAll('.exam-item');

    examItems.forEach((item, index) => {
        const examDate = exams[index].date;
        const examTime = exams[index].time;
        const examDateTime = new Date(`${examDate}T${examTime}`);

        const diff = examDateTime - now;

        if (diff <= 0) {
            item.querySelector('.exam-countdown').textContent = 'Exam started or passed!';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        item.querySelector('.exam-countdown').textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    });
}

function renderExamList() {
    const examListContainer = document.getElementById('exam-list');
    examListContainer.innerHTML = ''; // Clear existing list

    if (exams.length === 0) {
        examListContainer.innerHTML = '<p>No exams scheduled.</p>';
        return;
    }

    // Sort exams by date and time
    exams.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA - dateB;
    });

    exams.forEach((exam, idx) => {
        const examItem = document.createElement('div');
        examItem.className = 'exam-item';
        examItem.style.maxWidth = '400px';
        examItem.style.margin = '0 auto 18px auto';
        examItem.innerHTML = `
            <p><strong>Course:</strong> ${exam.course}</p>
            <p><strong>Date:</strong> ${exam.date}</p>
            <p><strong>Time:</strong> ${exam.time}</p>
            ${exam.notes ? `<p><strong>Notes:</strong> ${exam.notes}</p>` : ''}
            <p class="exam-countdown">Loading countdown...</p>
            <button class='btn btn-danger btn-sm delete-exam-btn' style='padding:2px 8px;font-size:0.85rem;'>Delete</button>
            <button class='btn btn-warning btn-sm me-2 edit-exam-btn' style='padding:2px 8px;font-size:0.85rem;'>Edit</button>
        `;
        examItem.querySelector('.edit-exam-btn').onclick = () => makeExamItemEditable(examItem, exam, idx);
        examItem.querySelector('.delete-exam-btn').onclick = () => {
            const deleted = exams.splice(idx, 1)[0];
            saveExamsToLocalStorage();
            renderExamList();
            showUndoSnackbar('Exam', deleted, idx);
        };
        examListContainer.appendChild(examItem);
    });

    updateExamCountdowns();
}

function displayClosestExam() {
    const now = new Date();
    let closestExam = null;
    let minTimeDifference = Infinity;

    exams.forEach(exam => {
        const examDateTime = new Date(`${exam.date}T${exam.time}`);
        const timeDifference = examDateTime - now;

        if (timeDifference > 0 && timeDifference < minTimeDifference) {
            closestExam = exam;
            minTimeDifference = timeDifference;
        }
    });

    const countdownElement = document.getElementById('countdown');

    if (closestExam) {
        const examDateTime = new Date(`${closestExam.date}T${closestExam.time}`);
        const days = Math.floor(minTimeDifference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((minTimeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((minTimeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((minTimeDifference % (1000 * 60)) / 1000);

        countdownElement.innerHTML = `
            <div style="background-color: #3a3a4b; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                <h2 style="color: #ff6f61;">Closest Exam</h2>
                <p><strong>Course:</strong> ${closestExam.course}</p>
                <p><strong>Date:</strong> ${closestExam.date}</p>
                <p><strong>Time:</strong> ${closestExam.time}</p>
                <p style="font-weight: bold; color: #00d4ff;">Starts in: ${days}d ${hours}h ${minutes}m ${seconds}s</p>
            </div>
        `;
    } else {
        countdownElement.textContent = 'No upcoming exams!';
    }
}

function displayClosestExamOnMainScreen() {
    const now = new Date();
    let closestExam = null;
    let minTimeDifference = Infinity;

    exams.forEach(exam => {
        const examDateTime = new Date(`${exam.date}T${exam.time}`);
        const timeDifference = examDateTime - now;

        if (timeDifference > 0 && timeDifference < minTimeDifference) {
            closestExam = exam;
            minTimeDifference = timeDifference;
        }
    });

    const closestExamElement = document.getElementById('closest-exam');

    if (closestExam) {
        const days = Math.floor(minTimeDifference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((minTimeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((minTimeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((minTimeDifference % (1000 * 60)) / 1000);

        closestExamElement.textContent = `Closest Exam - ${closestExam.course} starts in: ${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else {
        closestExamElement.innerHTML = '<span style="color: #ff6f61; font-weight: bold;">No upcoming exams!</span>';
    }
}

function deleteExam(index) {
    const deletedExam = exams.splice(index, 1)[0]; // Remove the exam at the given index
    saveExamsToLocalStorage(); // Save updated exams to localStorage
    renderExamList(); // Re-render the exam list
    showUndoSnackbar('Exam', deletedExam, index);
}

// CUSTOM COUNTDOWN WIDGET (feature 7)
function updateCustomCountdownWidget() {
    const widget = document.getElementById('custom-countdown-widget');
    // Show next class or next exam, whichever is sooner
    const now = new Date();
    let nextClass = null, nextExam = null, minClassDiff = Infinity, minExamDiff = Infinity;
    // Next class
    classes.forEach(cls => {
        const daysOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayIdx = now.getDay();
        const classIdx = daysOfWeek.indexOf(cls.day);
        let dayDiff = classIdx - todayIdx;
        if (dayDiff < 0 || (dayDiff === 0 && isClassOverToday(cls.startTime))) dayDiff += 7;
        const [h, m] = cls.startTime.split(':').map(Number);
        const classDate = new Date(now);
        classDate.setDate(now.getDate() + dayDiff);
        classDate.setHours(h, m, 0, 0);
        const diff = classDate - now;
        if (diff > 0 && diff < minClassDiff) { minClassDiff = diff; nextClass = cls; }
    });
    // Next exam
    exams.forEach(exam => {
        const examDateTime = new Date(`${exam.date}T${exam.time}`);
        const diff = examDateTime - now;
        if (diff > 0 && diff < minExamDiff) { minExamDiff = diff; nextExam = exam; }
    });
    let msg = '';
    if (minClassDiff < minExamDiff && nextClass) {
        const days = Math.floor(minClassDiff / (1000*60*60*24));
        const hours = Math.floor((minClassDiff % (1000*60*60*24)) / (1000*60*60));
        const minutes = Math.floor((minClassDiff % (1000*60*60)) / (1000*60));
        const seconds = Math.floor((minClassDiff % (1000*60)) / 1000);
        msg = `Next class (${nextClass.course}) in `;
        if (days > 0) msg += `${days}d `;
        if (hours > 0 || days > 0) msg += `${hours}h `;
        msg += `${minutes}m ${seconds}s`;
    } else if (nextExam) {
        const days = Math.floor(minExamDiff / (1000*60*60*24));
        const hours = Math.floor((minExamDiff % (1000*60*60*24)) / (1000*60*60));
        const minutes = Math.floor((minExamDiff % (1000*60*60)) / (1000*60));
        const seconds = Math.floor((minExamDiff % (1000*60)) / 1000);
        msg = `Next exam (${nextExam.course}) in `;
        if (days > 0) msg += `${days}d `;
        if (hours > 0 || days > 0) msg += `${hours}h `;
        msg += `${minutes}m ${seconds}s`;
    } else {
        msg = 'No upcoming classes or exams!';
    }
    widget.textContent = msg;
}
setInterval(updateCustomCountdownWidget, 1000);

// RECURRING EVENTS (feature 5) - UI and logic for weekly recurring classes is already present.
// For exams, recurrence is rare, so not implemented.
// For classes, the routine already supports weekly recurrence by design.

// NOTIFICATIONS/REMINDERS (feature 2)
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}
requestNotificationPermission();
function sendReminder(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}
// Remind 5 minutes before next class or exam
setInterval(function() {
    const now = new Date();
    // Next class
    classes.forEach(cls => {
        const daysOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayIdx = now.getDay();
        const classIdx = daysOfWeek.indexOf(cls.day);
        let dayDiff = classIdx - todayIdx;
        if (dayDiff < 0 || (dayDiff === 0 && isClassOverToday(cls.startTime))) dayDiff += 7;
        const [h, m] = cls.startTime.split(':').map(Number);
        const classDate = new Date(now);
        classDate.setDate(now.getDate() + dayDiff);
        classDate.setHours(h, m, 0, 0);
        const diff = classDate - now;
        if (diff > 0 && diff < reminderLeadTime*60*1000 && diff > (reminderLeadTime-1)*60*1000) {
            sendReminder('Class Reminder', `Upcoming class: ${cls.course} at ${cls.startTime} (${cls.room})`);
        }
    });
    // Next exam
    exams.forEach(exam => {
        const examDateTime = new Date(`${exam.date}T${exam.time}`);
        const diff = examDateTime - now;
        if (diff > 0 && diff < reminderLeadTime*60*1000 && diff > (reminderLeadTime-1)*60*1000) {
            sendReminder('Exam Reminder', `Upcoming exam: ${exam.course} at ${exam.time} on ${exam.date}`);
        }
    });
}, 30000);

// Force push notification for testing (with vibration for mobile)
window.forcePushNotification = function() {
    sendReminder('Test Notification', 'This is a test push notification from Classify!');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    alert('Test notification sent (if permission granted). If you are on a phone, you should also feel a vibration.');
};

setInterval(displayClosestExamOnMainScreen, 1000); // Update closest exam every second

document.getElementById('routine-form').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get all checked days from checkboxes
    const checkedDays = Array.from(document.querySelectorAll('#day-checkbox-group input[type="checkbox"]:checked')).map(cb => cb.value);
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const course = document.getElementById('course').value;
    const type = document.getElementById('type').value;
    const room = document.getElementById('room').value;

    if (checkedDays.length === 0) {
        alert('Please select at least one day for the class.');
        return;
    }

    // Add a class for each checked day
    checkedDays.forEach(day => {
        const newClass = { day, startTime, endTime, course, type, room };
        classes.push(newClass);
    });

    saveClassesToLocalStorage(); // Save updated routine to localStorage
    renderRoutine(); // Re-render the routine

    document.getElementById('routine-form').reset();
});

document.getElementById('reset-button').addEventListener('click', function() {
    localStorage.removeItem('classes');
    classes.length = 0; // Clear the classes array
    renderRoutine(); // Re-render the routine
});

const exams = JSON.parse(localStorage.getItem('exams')) || []; // Load exams from localStorage or start with an empty array

function saveExamsToLocalStorage() {
    localStorage.setItem('exams', JSON.stringify(exams));
}

document.getElementById('exam-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const date = document.getElementById('exam-date').value;
    const time = document.getElementById('exam-time').value;
    const course = document.getElementById('exam-course').value;
    const notes = document.getElementById('exam-notes').value; // Capture notes field

    const newExam = { date, time, course, notes }; // Include notes in the exam object
    exams.push(newExam);

    saveExamsToLocalStorage(); // Save updated exams to localStorage
    renderExamList(); // Re-render the exam list

    document.getElementById('exam-form').reset();
});

document.getElementById('reset-exam-button').addEventListener('click', function() {
    localStorage.removeItem('exams');
    exams.length = 0; // Clear the exams array
    renderExamList(); // Re-render the exam list
});

document.querySelector('.routine-container').addEventListener('click', function(event) {
    if (event.target.classList.contains('delete-class-button')) {
        const classCard = event.target.closest('.class-card');
        const day = classCard.querySelector('.class-timer').getAttribute('data-day');
        const startTime = classCard.querySelector('.class-timer').getAttribute('data-time');

        // Find the index of the class to delete
        const classIndex = classes.findIndex(cls => cls.day === day && cls.startTime === startTime);

        if (classIndex !== -1) {
            const deletedClass = classes.splice(classIndex, 1)[0]; // Remove the class from the array
            saveClassesToLocalStorage(); // Save updated classes to localStorage
            renderRoutine(); // Re-render the routine
            showUndoSnackbar('Class', deletedClass, classIndex);
        }
    }
});

// Track current class and exam
function updateCurrentEventTracker() {
    const now = new Date();
    let currentClass = null;
    let classStart = null, classEnd = null;
    classes.forEach(cls => {
        const daysOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayIdx = now.getDay();
        const classIdx = daysOfWeek.indexOf(cls.day);
        let dayDiff = classIdx - todayIdx;
        if (dayDiff < 0) dayDiff += 7;
        const [startH, startM] = cls.startTime.split(':').map(Number);
        const [endH, endM] = cls.endTime.split(':').map(Number);
        const start = new Date(now);
        start.setDate(now.getDate() + dayDiff);
        start.setHours(startH, startM, 0, 0);
        const end = new Date(now);
        end.setDate(now.getDate() + dayDiff);
        end.setHours(endH, endM, 0, 0);
        if (now >= start && now <= end) {
            currentClass = cls;
            classStart = start;
            classEnd = end;
        }
    });
    let currentExam = null;
    let examStart = null, examEnd = null;
    exams.forEach(exam => {
        const start = new Date(`${exam.date}T${exam.time}`);
        const end = new Date(start.getTime() + 3*60*60*1000);
        if (now >= start && now <= end) {
            currentExam = exam;
            examStart = start;
            examEnd = end;
        }
    });
    let tracker = document.getElementById('current-event-tracker');
    if (!tracker) {
        tracker = document.createElement('div');
        tracker.id = 'current-event-tracker';
        tracker.style = 'text-align:left; margin-bottom:10px; font-weight:bold; color:#00d4ff;';
        document.querySelector('.container').insertBefore(tracker, document.querySelector('.routine-container'));
    }
    let msg = '';
    if (!currentClass && !currentExam) {
        msg += `<div class="no-class-message">No more classes today!</div>`;
    }
    if (currentClass) {
        // Progress bar for class (show elapsed/total minutes to the left of the bar)
        const total = Math.round((classEnd - classStart) / 60000); // total minutes
        const elapsed = Math.round((now - classStart) / 60000);
        const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
        msg += `<div class="current-class-info">Current Class: <span>${currentClass.course}</span> <span class='class-time'>(${currentClass.startTime} - ${currentClass.endTime})</span> <span class='class-room'>in Room ${currentClass.room}</span></div>`;
        msg += `<div class='class-progress-row'>` +
               `<span id='class-progress-time'>${elapsed} / ${total} min</span>` +
               `<div class='progress stylish-progress'>` +
               `<div class='progress-bar stylish-progress-bar' role='progressbar' style='width:${percent}%;'></div></div></div>`;
    }
    if (currentExam) {
        msg += `<div class="current-exam-info">Current Exam: <span>${currentExam.course}</span> <span class='exam-time'>(${currentExam.date} ${currentExam.time})</span></div>`;
    }
    tracker.innerHTML = msg;
}
setInterval(updateCurrentEventTracker, 1000);

// Make all countdowns left aligned
function updateCountdownLeftAlign() {
    const countdown = document.getElementById('countdown');
    if (countdown) countdown.style.textAlign = 'left';
    const customWidget = document.getElementById('custom-countdown-widget');
    if (customWidget) customWidget.style.textAlign = 'left';
    const closestExam = document.getElementById('closest-exam');
    if (closestExam) closestExam.style.textAlign = 'left';
}
updateCountdownLeftAlign();

// === SETTINGS & ONBOARDING ===
let reminderLeadTime = parseInt(localStorage.getItem('reminderLeadTime')) || 5;

// Show onboarding/help modal on first visit
if (!localStorage.getItem('classifyOnboarded')) {
    setTimeout(() => {
        const helpModal = new bootstrap.Modal(document.getElementById('helpModal'));
        helpModal.show();
        localStorage.setItem('classifyOnboarded', '1');
    }, 500);
}

document.getElementById('help-btn').onclick = function() {
    const helpModal = new bootstrap.Modal(document.getElementById('helpModal'));
    helpModal.show();
};
document.getElementById('settings-btn').onclick = function() {
    document.getElementById('reminder-lead-time').value = reminderLeadTime;
    const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
    settingsModal.show();
};
document.getElementById('save-settings-btn').onclick = function() {
    reminderLeadTime = parseInt(document.getElementById('reminder-lead-time').value);
    localStorage.setItem('reminderLeadTime', reminderLeadTime);
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
};

// === UNDO SNACKBAR ===
let undoTimeout = null;
let lastDeleted = null;
function showUndoSnackbar(type, data, index) {
    const snackbar = document.getElementById('undo-snackbar');
    snackbar.innerHTML = `${type} deleted. <button id='undo-btn' class='btn btn-sm btn-primary ms-2'>Undo</button>`;
    snackbar.style.display = 'block';
    lastDeleted = { type, data, index };
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { snackbar.style.display = 'none'; lastDeleted = null; }, 5000);
    document.getElementById('undo-btn').onclick = function() {
        if (lastDeleted) {
            if (lastDeleted.type === 'Class') {
                classes.splice(lastDeleted.index, 0, lastDeleted.data);
                saveClassesToLocalStorage();
                renderRoutine();
            } else if (lastDeleted.type === 'Exam') {
                exams.splice(lastDeleted.index, 0, lastDeleted.data);
                saveExamsToLocalStorage();
                renderExamList();
            }
            snackbar.style.display = 'none';
            lastDeleted = null;
        }
    };
}

// === INLINE EDITING ===
function makeClassCardEditable(card, cls, idx) {
    card.innerHTML = `
        <input type='text' class='form-control mb-1' value='${cls.course}' id='edit-course-${idx}'>
        <input type='time' class='form-control mb-1' value='${cls.startTime}' id='edit-start-${idx}'>
        <input type='time' class='form-control mb-1' value='${cls.endTime}' id='edit-end-${idx}'>
        <input type='text' class='form-control mb-1' value='${cls.room}' id='edit-room-${idx}'>
        <select class='form-select mb-1' id='edit-type-${idx}'>
            <option value='Theory' ${cls.type==='Theory'?'selected':''}>Theory</option>
            <option value='Lab' ${cls.type==='Lab'?'selected':''}>Lab</option>
        </select>
        <button class='btn btn-success btn-sm me-2' id='save-edit-${idx}'>Save</button>
        <button class='btn btn-secondary btn-sm' id='cancel-edit-${idx}'>Cancel</button>
    `;
    document.getElementById(`save-edit-${idx}`).onclick = function() {
        cls.course = document.getElementById(`edit-course-${idx}`).value;
        cls.startTime = document.getElementById(`edit-start-${idx}`).value;
        cls.endTime = document.getElementById(`edit-end-${idx}`).value;
        cls.room = document.getElementById(`edit-room-${idx}`).value;
        cls.type = document.getElementById(`edit-type-${idx}`).value;
        saveClassesToLocalStorage();
        renderRoutine();
    };
    document.getElementById(`cancel-edit-${idx}`).onclick = function() { renderRoutine(); };
}
function makeExamItemEditable(item, exam, idx) {
    item.innerHTML = `
        <input type='text' class='form-control mb-1' value='${exam.course}' id='edit-exam-course-${idx}'>
        <input type='date' class='form-control mb-1' value='${exam.date}' id='edit-exam-date-${idx}'>
        <input type='time' class='form-control mb-1' value='${exam.time}' id='edit-exam-time-${idx}'>
        <input type='text' class='form-control mb-1' value='${exam.notes||''}' id='edit-exam-notes-${idx}'>
        <button class='btn btn-success btn-sm me-2' id='save-exam-edit-${idx}'>Save</button>
        <button class='btn btn-secondary btn-sm' id='cancel-exam-edit-${idx}'>Cancel</button>
    `;
    document.getElementById(`save-exam-edit-${idx}`).onclick = function() {
        exam.course = document.getElementById(`edit-exam-course-${idx}`).value;
        exam.date = document.getElementById(`edit-exam-date-${idx}`).value;
        exam.time = document.getElementById(`edit-exam-time-${idx}`).value;
        exam.notes = document.getElementById(`edit-exam-notes-${idx}`).value;
        saveExamsToLocalStorage();
        renderExamList();
    };
    document.getElementById(`cancel-exam-edit-${idx}`).onclick = function() { renderExamList(); };
}

// === PROGRESS DASHBOARD ===
function renderProgressDashboard() {
    const now = new Date();
    // Weekly stats
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    let weekClasses = 0, weekExams = 0, weekClassesDone = 0, weekExamsDone = 0;
    classes.forEach(cls => {
        weekClasses++;
        const daysOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const classIdx = daysOfWeek.indexOf(cls.day);
        const classDate = new Date(weekStart);
        classDate.setDate(weekStart.getDate() + classIdx);
        const [h, m] = cls.startTime.split(':').map(Number);
        classDate.setHours(h, m, 0, 0);
        if (classDate < now) weekClassesDone++;
    });
    exams.forEach(exam => {
        const examDate = new Date(`${exam.date}T${exam.time}`);
        if (examDate >= weekStart && examDate <= weekEnd) {
            weekExams++;
            if (examDate < now) weekExamsDone++;
        }
    });
    // Monthly exam stats
    const month = now.getMonth();
    let monthExams = 0, monthExamsDone = 0;
    exams.forEach(exam => {
        const examDate = new Date(`${exam.date}T${exam.time}`);
        if (examDate.getMonth() === month) {
            monthExams++;
            if (examDate < now) monthExamsDone++;
        }
    });
    document.getElementById('progress-dashboard').innerHTML = `
        <div style="background:#181828;border-radius:10px;padding:16px 18px;margin-bottom:10px;box-shadow:0 2px 8px #00d4ff22;">
            <b>Progress Dashboard</b><br>
            <span style='color:#00d4ff;'>This week:</span> ${weekClassesDone}/${weekClasses} classes, ${weekExamsDone}/${weekExams} exams completed<br>
            <span style='color:#00d4ff;'>This month:</span> ${monthExamsDone}/${monthExams} exams completed
        </div>
    `;
}
setInterval(renderProgressDashboard, 2000);

// Render the routine on page load
renderRoutine();
setInterval(updateCountdown, 1000);
setInterval(updateClassTimers, 1000);
setInterval(highlightNextClass, 1000);

// Render the exam list on page load
renderExamList();