import express from 'express';
import mysql from 'mysql';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import uuid from 'uuid-random';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;
const saltRounds = 10;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'admin'
});
const db1 = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'user'
});
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

// Middleware
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.static('public'));
app.set('view engine', 'ejs');
// Serve static files from the 'node_modules' directory
app.use('/scripts', express.static(path.join(__dirname, 'node_modules')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/.netlify/functions/api',router);
module.exports.handler = serverless(app);

// Routes
app.get('/',(req,res) =>{
    const user = null;
    res.render('index',{user});
})
//below is the student_dashboard
app.get('/student_dashboard',(req,res)=>{
    const username = req.query.user;
    const userid = req.query.id;
    const course = req.query.course;
    let date = new Date();
    const today = `${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`;
    console.log(userid);
    db.query(`SELECT *, DATE_FORMAT(created_at, '%d/%m/%Y') AS date_part FROM notices`,(err,results)=>{
        if(err){
            console.log(err)
        }
        const notices = results;
        console.log(notices);
        res.render('student_dashboard',{username:username,userid:userid,today:today,course:course,notices:notices});
    })
});
app.post('/sendfeedback', (req, res) => {
    const { userid, username, course, feedback } = req.body;
    // Insert the feedback into the feedback table in your database
    db.query('INSERT INTO feedback (student_id, student_name, course, feedback) VALUES (?, ?, ?, ?)',
      [userid, username, course, feedback],
      (err, result) => {
        if (err) {
          console.error('Error inserting feedback:', err);
          return res.status(500).json({ success: false, error: 'Error submitting feedback' });
        }
        
        console.log('Feedback inserted successfully:', result);
        res.send('Feedback submitted successfully' );
        // res.json({ success: true, message: });
      }
    );
  });
  


//below is the backend for student or user side
app.get('/student_login',(req,res)=>res.render('student_login'));
// Handle student login form submission
app.post('/studentlogin', (req, res) => {
    const { studentid, password } = req.body;

    db1.query('SELECT * FROM student WHERE student_ID = ?', [studentid], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            const user = results[0];
            // Assuming your password is stored as 'student_password' in the database
            if (user.student_password === password) {
                // Passwords match, user is authenticated
                res.render('Home_page',{user})
            } else {
                res.status(401).send('Incorrect password');
            }
        } else {
            res.status(404).send('User not found');
        }
    });
});
app.get('/exams', (req, res) => {
    const course = req.query.course;
    const studentId = req.query.studentId; // Assuming you have the student ID in the request

    if (!course || !studentId) {
        return res.status(400).send('Missing course or student ID'); // Handle missing parameters
    }

    db.query('SELECT * FROM examschedule WHERE course = ?', [course], (err, scheduledExams) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Database error'); // Handle database error
        }

        // Check if the student has already attempted the exam
        db.query('SELECT * FROM exam_scores WHERE student_id = ?', [studentId], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send('Database error');
            }

            const hasAttempted = results.length > 0;

            // Render the EJS template and pass the exams data along with other parameters
            res.render('exams', {
                exams: scheduledExams,
                course: course,
                studentId: studentId,
                isExamOver: isExamOver, // Pass the isExamOver function to the EJS template
                isExamStarted: isExamStarted, // Pass the isExamStarted function to the EJS template
                hasAttempted: hasAttempted // Pass whether the student has attempted the exam
            });
        });
    });
});


// Define the isExamOver and isExamStarted functions outside of the route handler
function isExamOver(examDate, examTime, examDuration) {
    const examEndDateTime = new Date(`${examDate}T${examTime}`);
    examEndDateTime.setMinutes(examEndDateTime.getMinutes() + parseInt(examDuration));
    const today = new Date();
    return today > examEndDateTime; // Exam is over if current date and time are greater than exam end date and time
}

function isExamStarted(examDate, examTime) {
    const today = new Date();
    const examDateTime = new Date(`${examDate}T${examTime}`);
    return examDateTime > today; // Allow if exam date and time are less than or equal to current date and time
}

app.get('/exampanel',(req,res)=>{
    const course = req.query.course;
    const examid = req.query.examid;
    const studentid = req.query.studentid;
    db.query('select * from exams where course = ?',[course],(err,questions)=>{
            if(err){
                console.error(err);
                return res.status(500).send('Database error');
            }
            console.log('exam panel:',examid,' ',studentid);
            res.render('exampanel',{questions:questions,examid:examid,studentid:studentid});
    })
    
});
app.post('/submit-exam', (req, res) => {
    // const { studentid, examid } = req.body; 
    const studentid = req.body.studentid;
    const examid = req.body.examid;
    console.log(studentid,' ',examid);
    const submittedAnswers = req.body; // Object containing question IDs and selected answers
    // console.log('Submitted answers:', submittedAnswers);
    // Example structure of submittedAnswers: { '2': 'choice2', '7': 'choice2', questionId: [ '2', '7' ] }
    // Step 1: Retrieve correct answers from the database
    const questionIds = submittedAnswers.questionId; // Array of question IDs
    db.query('SELECT question_id, correct_answer FROM exams WHERE question_id IN (?)', [questionIds], (err, results) => {
        if (err) {
            console.error('Error fetching correct answers:', err);
            return res.status(500).send('Error fetching correct answers');
        }

        // Step 2: Compare submitted answers with correct answers and calculate score
        let score = 0;
        results.forEach(row => {
            const questionId = row.question_id;
            const correctAnswer = row.correct_answer;
            const submittedAnswer = submittedAnswers[questionId];

            if (submittedAnswer === correctAnswer) {
                score++; // Increment score for each correct answer
            }
        });

        console.log('Score:', score); // Log the calculated score
        db.query('insert into exam_scores (student_id,exam_id,score) values (?,?,?)',[studentid,examid,score],(err,result)=>{
            if(err){
                console.error('Error recording score:', err);
            }
            console.log('insertion success full')
            // Set a flag in the session to indicate exam completion
            db1.query('select * from student where student_ID = ?',[studentid],(err,result)=>{
                if(err){
                    console.log('not getting details');
                }
                console.log(studentid);
                const user = result[0];
                console.log('User ',user);
                res.render('submitted',{
                    user});
            })
            
        })
        // You can send the score back to the client or store it in the database as needed     
    });
}
);
app.get('/scoreboard',(req,res)=>{
    const studentid = req.query.studentId;
    console.log(studentid);
    db.query('SELECT es.*, es.exam_id AS es_exam_id, ex.subject FROM exam_scores es JOIN examschedule ex ON es.exam_id = ex.examid WHERE es.student_id = ?', [studentid], (err, result) => {
        if (err) {
            console.log(err);
        }
        const scores = result;
        res.render('scoreboard', { scores: scores });
    });
    
})
app.get('/404',(req,res)=>{
    res.render('404error');
})
app.get('/events',(req,res)=>{
    db.query('select * from events',(err,result)=>{
        if(err){
            console.log(err);
        }
        const events = result;
        res.render('events',{events:events});
    })
})
app.get('/meetings',(req,res)=>{
    res.render('meetings');
})
app.get('/create-meeting', (req, res) => {
    db1.query('SELECT * FROM student', (err, students) => {
        if (err) {
            console.error('Error fetching students:', err);
            return res.status(500).send('Error fetching students');
        }

        res.render('create-meeting', { students });
    });
});

app.post('/create-meeting', (req, res) => {
    const { meetingName, meetingDate, meetingTime, meetingDescription, invitedStudents } = req.body;
    const meeting = {
        meeting_name: meetingName,
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        meeting_description: meetingDescription,
        invited_students: invitedStudents
    };

    db.query('INSERT INTO meetings SET ?', meeting, (err, result) => {
        if (err) {
            console.error('Error creating meeting:', err);
            return res.status(500).send('Error creating meeting');
        }

        console.log('Meeting created successfully:', result);
        res.send('Meeting created successfully');
    });
});












// below is all about the backend for admin 
app.get('/admin',(req,res)=>{
    res.render('login')
})
//render to signin
app.get('/signin', (req, res) => {
    res.render('signin');
});
//render to login
app.get('/login', (req, res) => {
    res.render('login');
});

//render to exam
app.get('/exam',(req,res)=>{
    // res.render('exam');
    const sql = 'SELECT * FROM examschedule';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching scheduled exams:', err);
            return res.status(500).send('Error fetching scheduled exams');
        }
        const scheduledExams = results; // Array of scheduled exams
        console.log(scheduledExams);
        res.render('exam', { scheduledExams });
    });
})
app.get('/exam_details', (req, res) => {
    const examid = req.query.examid; // Get the examid from the URL query parameter
    console.log(examid)
    // Fetch the exam details from examschedule table based on the examid
    db.query('SELECT * FROM examschedule WHERE examid = ?', [examid], (err, examScheduleResults) => {
        if (err) {
            console.error('Error fetching exam details:', err);
            return res.status(500).send('Error fetching exam details');
        }
        // console.log(examScheduleResults);
        // Fetch the questionids from exam_questions table based on the examid
        db.query('SELECT questionids FROM exam_questions WHERE examid = ?', [examid], (err, questionIdsResults) => {
            if (err) {
                console.error('Error fetching question IDs:', err);
                return res.status(500).send('Error fetching question IDs');
            }
            // Assuming questionIdsResults is the array you provided containing RowDataPacket objects
            const questionIdsArray = questionIdsResults.map(row => parseInt(row.questionids, 10));
            // console.log(questionIdsArray);

            // Fetch the exam questions from exams table based on the question IDs
            db.query('SELECT * FROM exams WHERE question_id IN (?)', [questionIdsArray], (err, examQuestionsResults) => {
                if (err) {
                    console.error('Error fetching exam questions:', err);
                    return res.status(500).send('Error fetching exam questions');
                }
                console.log(examScheduleResults[0])
                console.log(examQuestionsResults)
                // Render the exam_details.ejs page and pass exam details and questions data
                res.render('exam_details', {
                    examid: examid,
                    examSchedule: examScheduleResults[0], // Assuming there's only one exam schedule per examid
                    examQuestions: examQuestionsResults
                });
            });
        });
    });
});
app.get('/studentupload',(req,res)=>{
    res.render('studentupload');
})






app.get('/create-exam',(req,res)=>{
    res.render('create-exam');
});
function generateExamID(batch, date) {
    const year = date.split('-')[0].slice(-2); // Get last two digits of the year
    const sem = determineSemester(date); // You need to define determineSemester function
    return `${year}sem${sem}`;
}

// Dummy function to determine semester based on date
function determineSemester(date) {
    const month = parseInt(date.split('-')[1]);
    return month <= 6 ? 1 : 2;
}
app.post('/create-exam', (req, res) => {
    const { course, batch, time, date, duration, subject } = req.body;

    // Generate examid based on batch and semester
    const examid = `exam-${Date.now()}-${uuid()}`;

    // Insert data into exams table
    const sql = 'INSERT INTO examschedule (course, batch, time, date, duration, examid, subject) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const values = [course, batch, time, date, duration, examid, subject];

    // Uncomment and replace connection.query with your actual database connection and query
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error inserting exam:', err);
            return res.status(500).send('Error inserting exam');
        }
        console.log('Exam inserted successfully');
        console.log('Generated examid:', examid);
        res.redirect(`/questions?course=${encodeURIComponent(course)}&examid=${encodeURIComponent(examid)}`);
    });

    // Mock response (comment this block when using actual database connection)
    // console.log('Mock data inserted successfully');
    // console.log('Generated examid:', examid);
    // res.redirect('/create-exam2'); // Redirect to create-exam2 page
});

app.get('/questions', (req, res) => {
    const course = req.query.course;
    const sql = "SELECT * FROM exams WHERE course = ?";
    const examid = req.query.examid;
    db.query(sql, [course], (err, results) => {
        if (err) {
            console.error('Failed to retrieve data from database:', err);
            return res.status(500).send('Error retrieving questions');
        }
        console.log(results);
        res.render('questions', { questions: results, course ,examid});
    });
});
app.post('/save-selected-questions', (req, res) => {
    const examid = req.body.examid;
    const selectedQuestions = req.body.selectedQuestions; // Array of selected question IDs
    
    selectedQuestions.forEach(questionId => {
        const sql = 'INSERT INTO exam_questions (examid, questionids) VALUES (?, ?)';
        const values = [examid, questionId];
        
        db.query(sql, values, (err, result) => {
            if (err) {
                console.error('Error inserting selected question:', err);
                return res.status(500).send('Error inserting selected questions');
            }
            console.log('Selected question inserted successfully');
        });
    });

    res.send('Selected questions saved successfully.');
});

app.get('/create-exam2', (req, res) => {
    res.render('create-exam2');
});

app.get('/create-exam2',(req,res)=>{
    res.render('create-exam2');
})

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}


// Set storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

// Initialize multer upload
const upload = multer({ storage: storage });

// Handle file upload
app.post('/upload', upload.single('excelFile'), (req, res) => {
    const excelFilePath = path.join(__dirname, 'uploads', req.file.filename);
    
    // Parse Excel file
    const workbook = xlsx.readFile(excelFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = xlsx.utils.sheet_to_json(worksheet);

    // Store data in MySQL database
    for (let item of excelData) {
        console.log(excelData);
        const sql = `INSERT INTO exams (question, choice1, choice2, choice3, choice4, correct_answer, course) VALUES (?, ?, ?, ?, ?, ?,?)`;
        const values = [item.question, item.choice1, item.choice2, item.choice3, item.choice4, item.correct_answer, item.course];
        
        db.query(sql, values, (err, result) => {
            if (err) throw err;
            console.log('1 record inserted');
        });
    }

    res.send('Exam setup created successfully.');
});

app.post('/uploadstudent', upload.single('excelFile'), (req, res) => {
    const excelFilePath = path.join(__dirname, 'uploads', req.file.filename);
    
    // Parse Excel file
    const workbook = xlsx.readFile(excelFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = xlsx.utils.sheet_to_json(worksheet);

    // Store data in MySQL database
    for (let item of excelData) {
        console.log(excelData);
        const sql = `INSERT INTO student (student_ID, student_password, student_name, Parents_name, phone_no, parents_phone, address,blood_group,category,student_email,course) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
        const values = [item.studentid, item.password, item.name, item.parents, item.phone,item.parents_phone, item.address, item.bloodgroup,item.category,item.studentemail,item.course];
        
        db1.query(sql, values, (err, result) => {
            if (err) throw err;
            console.log('1 record inserted');
        });
    }

    res.send(' successfully.');
});



//Create question bank
app.get('/create-bank',(req,res)=>{
    res.render('create-bank');
})
// Handle form submission
app.post('/save-question', (req, res) => {
    const { question, choice1, choice2, choice3, choice4, correct_answer,course } = req.body;
    // Save the question data to your database or perform any other action
    console.log('Question:', question);
    console.log('Options:', [choice1, choice2, choice3, choice4]);
    console.log('Correct_answer:', correct_answer);
    res.redirect('create-bank');

    //  // Insert data into MySQL database
     const sql = 'INSERT INTO exams (question, choice1, choice2, choice3, choice4, correct_answer,course) VALUES (?, ?, ?, ?, ?, ?,?)';
     const values = [question, choice1, choice2, choice3, choice4, correct_answer, course];
     
     db.query(sql, values, (err, result) => {
         if (err) {
             console.error('Error inserting question:', err);
             return res.status(500).send('Error inserting question');
         }
         console.log('Question inserted successfully');
         res.redirect('/');
     });
});


//admin profile
app.get('/Admin_profile',(req,res)=>{
    res.render('Admin_profile');
})
//Home_page2
app.get('/Home_page2',(req,res)=>{
    res.render('Home_page2');
})

//calender
app.get('/calender',(req,res)=>{
    res.render('calender');
})

//dashboard
app.get('/dashboard',(req,res)=>{
    res.render('dashboard');
})

//handle the signin form submission
app.post('/signin', (req, res) => {
    const { name, email, contact, gender, dob, username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => { // Ensure saltRounds is defined; here it's directly set as 10 for simplicity
        if (err) {
            console.error(err);
            return res.status(500).send('An error occurred while hashing the password.');
        }

        // Adjusted object keys to match your database schema
        const admin = {
            admin_ID: username, // Assuming 'username' maps to 'admin_ID'
            Admin_name: name,
            Admin_Mail: email,
            Admin_contact_number: contact,
            Admin_Gender: gender,
            Admin_Date_of_birth: dob,
            password: hash // 'password' column matches directly
        };

        db.query('INSERT INTO admin SET ?', admin, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('An error occurred while inserting the admin data.');
            }
            res.send('Admin signed in successfully');
        });
    });
});

// Handle login form submission
app.post('/login', (req, res) => {
    const { adminid, password } = req.body;

    db.query('SELECT * FROM admin WHERE admin_ID = ?', [adminid], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const user = results[0];

            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) throw err;

                if (isMatch) {
                    db.query('select * from feedback',(err,result)=>{
                        if(err){
                            console.log(err);
                        }
                        const feedbacks = result;
                        const adminname = user.Admin_name;
                        console.log(adminname);
                        res.render('dashboard', { admin: user, feedbacks: feedbacks,adminname });
                        
                    }) 
                } else {
                    res.send('Incorrect password');
                }
            });
        } else {
            res.send('User not found');
        }
    });
});
app.get('/dashboard', (req, res) => {
    const adminname = req.query.adminname;

    db.query('SELECT * FROM admin WHERE adminname = ?', [adminname], (err, results) => {
        if (err) {
            console.error('Error fetching admin:', err);
            return res.status(500).send('Error fetching admin');
        }

        if (results.length > 0) {
            const admin = results[0]; // Assuming admin data is in the first element of the array
            res.render('dashboard', { admin });
        } else {
            res.status(404).send('Admin not found');
        }
    });
});

app.get('/batches',(req,res)=>{
    db1.query('select * from student',(err,result)=>{
        if(err){
            console.log(err);
        }
        const students = result;
        res.render('batches',{students})
    })
})
app.post('/create_notice', (req, res) => {
    const noticeContent = req.body.notice;

    // Insert the notice into the database
    db.query('INSERT INTO notices (notice) VALUES (?)', [noticeContent], (err, result) => {
        if (err) {
            console.error('Error creating notice:', err);
            return res.status(500).send('Error creating notice');
        }
        res.send('Notice published successfully ');
        // Redirect back to the create notice form after successful creation
    });
});

app.get('/create-event',(req,res)=>{
    res.render('create-event');
})
// POST route to handle form submission and insert data into the 'events' table
app.post('/add-event', (req, res) => {
    const { eventName, eventDescription, eventDate, eventTime, eventLocation, organizerName, organizerContact, registrationLink } = req.body;

    // Insert data into the 'events' table
    const sql = 'INSERT INTO events (event_name, event_description, event_date, event_time, event_location, organizer_name, organizer_contact, registration_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [eventName, eventDescription, eventDate, eventTime, eventLocation, organizerName, organizerContact, registrationLink];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error inserting event:', err);
            res.status(500).send('Error inserting event');
        } else {
            console.log('Event inserted successfully:', result);
            res.send('Event inserted successfully'); // Redirect to home page or any other page after successful submission
        }
    });
});

// // Render user dashboard based on user ID
// app.get('/dashboard/:admin_Id', (req, res) => {
//     const admin_Id = req.params.admin_Id;
//     const feedbacks = req.feedbacks;

//     // Fetch user details and tasks from the database
//     db.query('SELECT * FROM admin WHERE admin_id = ?', [admin_Id], (err, adminResults) => {
//         if (err) throw err;

//         if (adminResults.length > 0) {
//             const admin = adminResults[0];
//             res.render('dashboard', {admin,feedbacks:feedbacks})
//             // db.query('SELECT * FROM tasks WHERE admin_ID = ?', [admin_Id], (err, tasksResults) => {
//             //     if (err) throw err;

//             //     // Render the dashboard with user details and tasks
//             //     res.render('dashboard', { admin, tasks: tasksResults });
//             // });
//         } else {
//             res.send('User not found');
//         }
//     });
// });

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
