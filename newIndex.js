const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// MongoDB Database Connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// JWT Middleware
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send('Access denied');

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send('Invalid token');
        req.user = user;
        next();
    });
}

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await client.connect();
        console.log("Connected to MongoDB");

        const database = client.db("marathonDB");
        const marathonsCollection = database.collection("marathons");
        const registrationsCollection = database.collection("registrations");

        // Authentication
        app.post('/login', (req, res) => {
            const { email, password } = req.body;
            // Replace this with a real user verification logic
            if (email === 'test@example.com' && password === 'Password123') {
                const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
                res.send({ token });
            } else {
                res.status(401).send('Invalid credentials');
            }
        });

        // Marathons Operations

        // Get all marathons with optional sorting
        app.get('/marathons', async (req, res) => {
            const sort = req.query.sort === 'asc' ? 1 : -1;
            const marathons = await marathonsCollection.find().sort({ createdAt: sort }).toArray();
            res.send(marathons);
        });

        // Get marathon by ID
        app.get('/marathons/:id', async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send('Invalid marathon ID');
            const marathon = await marathonsCollection.findOne({ _id: new ObjectId(id) });
            res.send(marathon);
        });

        // Add a new marathon
        app.post('/marathons', authenticateToken, async (req, res) => {
            const newMarathon = {
                ...req.body,
                createdAt: new Date(),
                totalRegistrations: 0
            };
            const result = await marathonsCollection.insertOne(newMarathon);
            res.send(result);
        });

        // Update marathon by ID
        app.put('/marathons/:id', authenticateToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send('Invalid marathon ID');
            const updatedMarathon = req.body;
            const result = await marathonsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedMarathon });
            res.send(result);
        });

        // Delete marathon by ID
        app.delete('/marathons/:id', authenticateToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send('Invalid marathon ID');
            const result = await marathonsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Registration Operations

        // Get all registrations for a marathon
        app.get('/marathons/:id/registrations', authenticateToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send('Invalid marathon ID');
            const registrations = await registrationsCollection.find({ marathonId: id }).toArray();
            res.send(registrations);
        });

        // Add a new registration
        app.post('/registrations', authenticateToken, async (req, res) => {
            const { marathonId, ...registrationData } = req.body;
            if (!ObjectId.isValid(marathonId)) return res.status(400).send('Invalid marathon ID');

            const marathon = await marathonsCollection.findOne({ _id: new ObjectId(marathonId) });
            if (!marathon) return res.status(404).send('Marathon not found');

            const result = await registrationsCollection.insertOne({ ...registrationData, marathonId });

            // Increment total registrations count
            await marathonsCollection.updateOne({ _id: new ObjectId(marathonId) }, { $inc: { totalRegistrations: 1 } });
            res.send(result);
        });

        // Delete a registration
        app.delete('/registrations/:id', authenticateToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send('Invalid registration ID');

            const registration = await registrationsCollection.findOne({ _id: new ObjectId(id) });
            if (!registration) return res.status(404).send('Registration not found');

            const result = await registrationsCollection.deleteOne({ _id: new ObjectId(id) });

            // Decrement total registrations count
            await marathonsCollection.updateOne({ _id: new ObjectId(registration.marathonId) }, { $inc: { totalRegistrations: -1 } });
            res.send(result);
        });

        // Search registrations by title (case-insensitive)
        app.get('/registrations/search', authenticateToken, async (req, res) => {
            const { title } = req.query;
            const regex = new RegExp(title, 'i');
            const registrations = await registrationsCollection.find({ title: { $regex: regex } }).toArray();
            res.send(registrations);
        });

        app.get('/', (req, res) => {
            res.send('Welcome to the Marathon Management System API');
        });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (error) {
        console.error(error);
    }
}

run().catch(console.dir);
