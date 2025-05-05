const classes = JSON.parse(localStorage.getItem('classes')) || []; // Load routine from localStorage or start with an empty array

function saveClassesToLocalStorage() {
    localStorage.setItem('classes', JSON.stringify(classes));
}

function renderRoutine() {
    const routineContainer = document.querySelector('.routine-container');
    routineContainer.innerHTML = ''; // Clear existing routine

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    daysOfWeek.forEach(day => {
        const dayClasses = classes.filter(cls => cls.day === day);

        if (dayClasses.length > 0) {
            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.innerHTML = `<h3>${day}</h3>`;

            dayClasses.forEach(cls => {
                const classCard = document.createElement('div');
                classCard.className = 'class-card';
                classCard.innerHTML = `
                    <h4>${cls.course}</h4>
                    <p>Type: ${cls.type}</p>
                    <p>Room: ${cls.room}</p>
                    <p>${cls.startTime} - ${cls.endTime}</p>
                    <p class="class-timer" data-time="${cls.startTime}" data-day="${cls.day}">Loading...</p>
                    <button class="delete-class-button">Delete</button>
                `;
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

    const now = new Date();
    const [startHour, startMinute] = nextClass.startTime.split(':').map(Number);
    const nextClassTime = new Date();
    nextClassTime.setHours(startHour, startMinute, 0);

    const diff = nextClassTime - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownElement.textContent = `Next class (${nextClass.course}) starts in: ${hours}h ${minutes}m ${seconds}s`;
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

    exams.forEach((exam, index) => {
        const examItem = document.createElement('div');
        examItem.className = 'exam-item';
        examItem.innerHTML = `
            <p><strong>Course:</strong> ${exam.course}</p>
            <p><strong>Date:</strong> ${exam.date}</p>
            <p><strong>Time:</strong> ${exam.time}</p>
            <p class="exam-countdown">Loading countdown...</p>
            <button class="btn btn-danger btn-sm" onclick="deleteExam(${index})">Delete</button>
        `;
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
    exams.splice(index, 1); // Remove the exam at the given index
    saveExamsToLocalStorage(); // Save updated exams to localStorage
    renderExamList(); // Re-render the exam list
}

setInterval(displayClosestExamOnMainScreen, 1000); // Update closest exam every second

document.getElementById('routine-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const day = document.getElementById('day').value;
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const course = document.getElementById('course').value;
    const type = document.getElementById('type').value;
    const room = document.getElementById('room').value;

    const newClass = { day, startTime, endTime, course, type, room };
    classes.push(newClass);

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

    const newExam = { date, time, course };
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
            classes.splice(classIndex, 1); // Remove the class from the array
            saveClassesToLocalStorage(); // Save updated classes to localStorage
            renderRoutine(); // Re-render the routine
        }
    }
});

// Render the routine on page load
renderRoutine();
setInterval(updateCountdown, 1000);
setInterval(updateClassTimers, 1000);
setInterval(highlightNextClass, 1000);

// Render the exam list on page load
renderExamList();