const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");
const User = require("../src/models/User");
const Role = require("../src/models/Role");
const Project = require("../src/models/Project");
const Task = require("../src/models/Task");
const ActivityLog = require("../src/models/ActivityLog");
const nodemailer = require("nodemailer");
require("dotenv").config();

jest.mock("nodemailer"); // Mock nodemailer to prevent actual email sending

describe("ActivityLog Controller Tests", () => {
  const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  let adminUser, pmUser, teamMemberUser;
  let adminRole, pmRole, teamMemberRole;
  let project, task;
  let authToken;

  const testUsers = {
    admin: {
      firstname: "Admin",
      lastname: "User",
      email: "admin@test.com",
      phone: "+123456789",
      password: "Password123"
    },
    pm: {
      firstname: "Project",
      lastname: "Manager",
      email: "pm@test.com",
      phone: "+123456790",
      password: "Password123"
    },
    teamMember: {
      firstname: "Team",
      lastname: "Member",
      email: "team@test.com",
      phone: "+123456791",
      password: "Password123"
    }
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    if (mongoose.connection.readyState === 0) {
      console.log("🕐 Connecting to MongoDB...");
      await mongoose.connect(mongoUri);
    }

    let attempts = 0;
    while (mongoose.connection.readyState !== 1 && attempts < 5) {
      console.log(`🔄 Attempt ${attempts + 1} to connect to MongoDB...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error("❌ Failed to connect to MongoDB.");
    }

    console.log("✅ MongoDB connected!");
    await User.deleteMany({});
    await Role.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});
    await ActivityLog.deleteMany({});

    // Create roles
    adminRole = await new Role({ name: "Admin" }).save();
    pmRole = await new Role({ name: "Project Manager" }).save();
    teamMemberRole = await new Role({ name: "Team Member" }).save();

    // Register users
    await request(app).post("/api/auth/register").send({ ...testUsers.admin, role: adminRole._id });
    await request(app).post("/api/auth/register").send({ ...testUsers.pm, role: pmRole._id });
    await request(app).post("/api/auth/register").send({ ...testUsers.teamMember, role: teamMemberRole._id });

    // Fetch users
    adminUser = await User.findOne({ email: testUsers.admin.email });
    pmUser = await User.findOne({ email: testUsers.pm.email });
    teamMemberUser = await User.findOne({ email: testUsers.teamMember.email });

    // Create a project with required startDate and endDate
    try {
      project = await new Project({
        name: "Test Project",
        projectManager: pmUser._id,
        teamMembers: [teamMemberUser._id],
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31")
      }).save();
    } catch (error) {
      console.error("❌ Error creating project:", error.message);
      throw error;
    }

    // Create a task
    try {
      task = await new Task({
        title: "Test Task",
        project: project._id,
        createdBy: pmUser._id
      }).save();
    } catch (error) {
      console.error("❌ Error creating task:", error.message);
      throw error;
    }

    // Create sample activity logs
    await new ActivityLog({
      user: adminUser._id,
      action: "CREATE",
      targetType: "PROJECT",
      targetId: project._id,
      message: "Project created"
    }).save();

    await new ActivityLog({
      user: pmUser._id,
      action: "CREATE",
      targetType: "TASK",
      targetId: task._id,
      message: "Task created"
    }).save();

    // Login as admin to get auth token
    const loginRes = await request(app).post("/api/auth/login").send({
      email: testUsers.admin.email,
      password: testUsers.admin.password
    });
    authToken = loginRes.body.token;
  });

  afterAll(async () => {
    await mongoose.connection.close();
    console.log("🛑 MongoDB connection closed.");
  });

  beforeEach(async () => {
    // Clear activity logs before each test
    await ActivityLog.deleteMany({});
    // Recreate sample logs
    await new ActivityLog({
      user: adminUser.id,
      action: "CREATE",
      targetType: "PROJECT",
      targetId: project._id,
      message: "Project created"
    }).save();
    await new ActivityLog({
      user: pmUser.id,
      action: "CREATE",
      targetType: "TASK",
      targetId: task._id,
      message: "Task created"
    }).save();
  });

  /*** TEST 1: Fetch activity logs as Admin ***/
  it("should fetch all activity logs for Admin", async () => {
    const res = await request(app)
      .get(`/api/logs/activity-logs?userId=${adminUser._id}`)
      .set("Authorization", `Bearer ${authToken}`);

    console.log("📢 Fetch Activity Logs (Admin) Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("totalLogs");
    expect(res.body).toHaveProperty("currentPage");
    expect(res.body).toHaveProperty("totalPages");
  });

  /*** TEST 2: Fetch activity logs as Project Manager ***/
  it("should fetch relevant activity logs for Project Manager", async () => {
    // Login as Project Manager
    const loginRes = await request(app).post("/api/auth/login").send({
      email: testUsers.pm.email,
      password: testUsers.pm.password
    });
    const pmToken = loginRes.body.token;

    const res = await request(app)
      .get(`/api/logs/activity-logs?userId=${pmUser._id}`)
      .set("Authorization", `Bearer ${pmToken}`);

    console.log("📢 Fetch Activity Logs (PM) Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body.logs.some((log) => log.targetId.toString() === task._id.toString())).toBe(true);
  });

  /*** TEST 3: Deny access to Team Member ***/
  /*it("should deny access to activity logs for Team Member", async () => {
    // Login as Team Member
    const loginRes = await request(app).post("/api/auth/login").send({
      email: testUsers.teamMember.email,
      password: testUsers.teamMember.password
    });
    const teamToken = loginRes.body.token;

    const res = await request(app)
      .get(`/api/logs/activity-logs?userId=${teamMemberUser._id}`)
      .set("Authorization", `Bearer ${teamToken}`);

    console.log("📢 Fetch Activity Logs (Team Member) Response:", res.status, res.body);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Team Members are not allowed to view activity logs.");
  });*/

  /*** TEST 4: Fail when userId is missing ***/
  it("should fail when userId is not provided", async () => {
    const res = await request(app)
      .get("/api/logs/activity-logs")
      .set("Authorization", `Bearer ${authToken}`);

    console.log("📢 Fetch Activity Logs (Missing userId) Response:", res.status, res.body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("userId est requis dans les paramètres de requête.");
  });

  /*** TEST 5: Fail when userId is invalid ***/
  it("should fail when userId is invalid", async () => {
    const invalidUserId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/logs/activity-logs?userId=${invalidUserId}`)
      .set("Authorization", `Bearer ${authToken}`);

    console.log("📢 Fetch Activity Logs (Invalid userId) Response:", res.status, res.body);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Utilisateur non trouvé.");
  });

  /*** TEST 6: Mock email notification for Admin anomaly ***/
 /* it("should send anomaly alert to Admin", async () => {
    const sendMailMock = jest.fn().mockResolvedValue({ response: "250 OK" });
    nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

    const anomaly = {
      user: adminUser,
      actionCount: 10,
      logs: [{ message: "Test action", createdAt: new Date() }]
    };

    await require("../src/controllers/activityLogController").sendAdminAnomalyAlert(anomaly);

    expect(sendMailMock).toHaveBeenCalled();
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({
      from: "ranimsboui2003@gmail.com",
      to: adminUser.email,
      subject: "🚨 Anomaly Alert - Excessive Activity Detected"
    });
  });*/
});