const fs = require('fs');
const path = require('path');

async function test() {
  // Try timetable.pdf which might be text-based
  const filePath = path.join(__dirname, 'timetable.pdf');
  if (!fs.existsSync(filePath)) {
    console.error('timetable.pdf not found');
    process.exit(1);
  }

  const formData = new FormData();
  const blob = new Blob([fs.readFileSync(filePath)]);
  formData.append('file', blob, 'timetable.pdf');

  console.log('Sending timetable.pdf...');
  const res = await fetch('http://localhost:3000/api/parse-timetable', {
    method: 'POST',
    body: formData,
  });
  console.log('Status:', res.status);
  const data = await res.json();
  if (res.ok) {
    console.log('SUCCESS!');
    console.log('Subjects:', data.subjects?.length || 0);
    if (data.subjects?.length > 0) {
      data.subjects.forEach((s, i) => console.log(`  Subject ${i+1}: ${s.name} (${s.code}) - ${s.faculty}`));
    }
    console.log('Timetable Entries:', data.timetableEntries?.length || 0);
    if (data.timetableEntries?.length > 0) {
      data.timetableEntries.slice(0, 10).forEach((e, i) => console.log(`  Entry ${i+1}: ${e.day} ${e.startTime}-${e.endTime} ${e.subjectName} ${e.componentType}`));
    }
    console.log('Verification log:', data.verificationLog);
  } else {
    console.log('ERROR:', JSON.stringify(data, null, 2));
  }
}

test();