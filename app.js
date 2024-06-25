const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const nodemailer = require('nodemailer');
const axios = require('axios')

const app = express();
const port = 3000;
const SECRET_KEY = '65sa4df65sa4df6';
const userDataPath = 'users.json';
const expenseDataPath = 'expenses.json';
const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "ca160c899bbb16",
        pass: "e9440d07ce25a5"
    }
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API de gestion des dépenses',
            version: '1.0.0',
            description: 'API pour gérer les dépenses des utilisateurs',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
            },
        ],
    },
    apis: ['./app.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const checkFiles = (req, res, next) => {
    if (!fs.existsSync(userDataPath)) {
        fs.writeFileSync(userDataPath, '[]');
    }
    if (!fs.existsSync(expenseDataPath)) {
        fs.writeFileSync(expenseDataPath, '[]');
    }
    next();
};

const readData = (filePath) => {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
};

const writeData = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Connecte un utilisateur
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connexion réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Identifiants invalides
 */
app.post('/login', checkFiles, (req, res) => {
    const {email, password} = req.body;
    const users = readData(userDataPath);
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        const token = jwt.sign({id: user.id, email: user.email}, SECRET_KEY, {expiresIn: '2h'});
        res.json({token, user: {id: user.id, email: user.email, name: user.name}});
    } else {
        res.status(401).json({error: 'Invalid credentials.'});
    }
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Inscrit un nouvel utilisateur
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inscription réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Email déjà utilisé
 */
app.post('/register', checkFiles, (req, res) => {
    const {name, email, password} = req.body;
    const users = readData(userDataPath);

    if (users.find(u => u.email === email)) {
        return res.status(400).json({error: 'Email already in use'});
    }

    const newUser = {
        id: (users.length + 1).toString(),
        name,
        email,
        password
    };

    users.push(newUser);
    writeData(userDataPath, users);

    const token = jwt.sign({id: newUser.id, email: newUser.email}, SECRET_KEY, {expiresIn: '1h'});
    res.json({token, user: {id: newUser.id, name: newUser.name, email: newUser.email}});
});

/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: Récupère toutes les dépenses de l'utilisateur actuel
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des dépenses de l'utilisateur
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Expense'
 */
app.get('/expenses', authenticateToken, checkFiles, (req, res) => {
    const expenses = readData(expenseDataPath);
    const userExpenses = expenses.filter(expense => expense.userId === req.user.id);
    res.json(userExpenses);
});

/**
 * @swagger
 * /expenses/{id}:
 *   get:
 *     summary: Récupère une dépense par son ID
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Détails de la dépense
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Dépense non trouvée
 */
app.get('/expenses/:id', authenticateToken, checkFiles, (req, res) => {
    const expenses = readData(expenseDataPath);
    const expense = expenses.find(e => e.id === req.params.id);
    if (expense) {
        res.json(expense);
    } else {
        res.status(404).send('Expense not found.');
    }
});

/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Ajoute une nouvelle dépense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewExpense'
 *     responses:
 *       201:
 *         description: Dépense créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 */
app.post('/expenses', authenticateToken, checkFiles, (req, res) => {
    const expenses = readData(expenseDataPath);
    const newExpense = {
        id: (expenses.length + 1).toString(),
        ...req.body,
        userId: req.user.id
    };
    expenses.push(newExpense);
    writeData(expenseDataPath, expenses);
    res.status(201).json(newExpense);
});

/**
 * @swagger
 * /expenses/{id}:
 *   put:
 *     summary: Met à jour une dépense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Expense'
 *     responses:
 *       200:
 *         description: Dépense mise à jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Dépense non trouvée ou non autorisée
 */
app.put('/expenses/:id', authenticateToken, checkFiles, (req, res) => {
    const expenses = readData(expenseDataPath);
    const index = expenses.findIndex(e => e.id === req.params.id && e.userId === req.user.id);
    if (index !== -1) {
        expenses[index] = {...expenses[index], ...req.body};
        writeData(expenseDataPath, expenses);
        res.json(expenses[index]);
    } else {
        res.status(404).send('Expense not found or not authorized.');
    }
});

/**
 * @swagger
 * /expenses/{id}:
 *   delete:
 *     summary: Supprime une dépense
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dépense supprimée
 *       404:
 *         description: Dépense non trouvée ou non autorisée
 */
app.delete('/expenses/:id', authenticateToken, checkFiles, (req, res) => {
    let expenses = readData(expenseDataPath);
    const initialLength = expenses.length;
    expenses = expenses.filter(e => !(e.id === req.params.id && e.userId === req.user.id));
    if (expenses.length < initialLength) {
        writeData(expenseDataPath, expenses);
        res.sendStatus(200);
    } else {
        res.status(404).send('Expense not found or not authorized.');
    }
});

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - email
 *         - password
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         password:
 *           type: string
 *     NewUser:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         password:
 *           type: string
 *     LoginCredentials:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *         password:
 *           type: string
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         user:
 *           $ref: '#/components/schemas/User'
 *     Expense:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - amount
 *         - userId
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         amount:
 *           type: number
 *         userId:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         category:
 *           type: string
 *         description:
 *           type: string
 *     NewExpense:
 *       type: object
 *       required:
 *         - name
 *         - amount
 *       properties:
 *         name:
 *           type: string
 *         amount:
 *           type: number
 *         date:
 *           type: string
 *           format: date
 *         category:
 *           type: string
 *         description:
 *           type: string
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 */

app.get('/test-swagger', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Test Swagger</title>
        </head>
        <body>
          <h1>Test de l'implémentation Swagger</h1>
          <p>Accédez à la documentation Swagger : <a href="/api-docs">/api-docs</a></p>
        </body>
      </html>
    `);
});

/**
 * @swagger
 * /send-expense-report:
 *   post:
 *     summary: Envoie un rapport de dépenses par email
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - startDate
 *               - endDate
 *             properties:
 *               email:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Rapport envoyé avec succès
 *       401:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 */
app.post('/send-expense-report', authenticateToken, async (req, res) => {
    const { email, startDate, endDate } = req.body;
    const userId = req.user.id;

    try {
        const expenses = readData(expenseDataPath);
        const userExpenses = expenses.filter(expense =>
            expense.userId === userId &&
            new Date(expense.date) >= new Date(startDate) &&
            new Date(expense.date) <= new Date(endDate)
        );
        const total = userExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const mailOptions = {
            from: 'nashtefison@gmail.com',
            to: email,
            subject: 'Your Expense Report',
            html: `
                <h1>Expense Report</h1>
                <p>From ${startDate} to ${endDate}</p>
                <h2>Total Expenses: $${total.toFixed(2)}</h2>
                <table>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Amount</th>
                  </tr>
                  ${userExpenses.map(expense => `
                    <tr>
                      <td>${expense.date}</td>
                      <td>${expense.name}</td>
                      <td>$${expense.amount.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </table>
      `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'Report sent successfully' });
    } catch (error) {
        console.error('Error sending report:', error);
        res.status(500).json({ error: 'Failed to send report' });
    }
});

axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
});