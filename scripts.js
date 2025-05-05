const classes = JSON.parse(localStorage.getItem('classes')) || [];
const exams = JSON.parse(localStorage.getItem('exams')) || [];

function saveClassesToLocalStorage() {
    localStorage.setItem('classes', JSON.stringify(classes));
}

function saveExamsToLocalStorage() {
    localStorage.setItem('exams', JSON.stringify(exams));
}

function deleteClass(index) {
    classes.splice(index, 1);
    saveClassesToLocalStorage();
    renderRoutine();
}

function deleteExam(index) {
    exams.splice(index, 1);
    saveExamsToLocalStorage();
    renderExamList();
}

function renderRoutine() {
    const routineContainer = document.querySelector('.routine-container');
    routineContainer.innerHTML = '';

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    daysOfWeek.forEach(day => {
        const dayClasses = classes.filter(cls => cls.day === day);

        if (dayClasses.length > 0) {
            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.innerHTML = `<h3>${day}</h3>`;

            dayClasses.forEach((cls, index) => {
                const classCard = document.createElement('div');
                classCard.className = 'class-card';
                classCard.innerHTML = `
                    <h4>${cls.course}</h4>
                    <p>Type: ${cls.type}</p>
                    <p>Room: ${cls.room}</p>
                    <p>${cls.startTime} - ${cls.endTime}</p>
                    <p class="class-timer" data-time="${cls.startTime}" data-day="${cls.day}">Loading...</p>
                    <span class="delete-icon" onclick="deleteClass(${index})">🗑️</span>
                `;
                dayColumn.appendChild(classCard);
            });

            routineContainer.appendChild(dayColumn);
        }
    });
}

function renderExamList() {
    const examListContainer = document.getElementById('exam-list');
    examListContainer.innerHTML = '';

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

setInterval(updateExamCountdowns, 1000);
renderRoutine();
renderExamList();