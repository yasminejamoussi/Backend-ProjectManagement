# 🌟 Orkestra: AI-Based Project Management Platform 🌟

## Overview 🚀

Orkestra is an **AI-based project management platform** designed to optimize team collaboration and project execution. Built with a vibrant **React** frontend, it leverages AI for **project deadlines**, **task delay/priority prediction**, **skill extraction**, **team member recommendations**, and **anomaly detection** in login attempts and logs. With advanced features like **role-based access control (RBAC)**, **personalized SMS/email notifications**, **Kanban boards**, and **automated badge assignments**, Orkestra creates a secure and efficient environment for managing projects and teams. 🎯

**Key Features**:

- 🔒 Secure authentication with Google Sign-In, Face ID, and 2FA
- 🛡️ Role-based access control (RBAC) for dashboards and features
- 🧠 AI-driven skill extraction and project member recommendations
- ⏰ AI-based task priority and deadline prediction
- 🏅 Automated badge assignments for performance recognition
- 📩 Personalized SMS/email notifications with role-based access
- 📊 Kanban boards and productivity graphs for project management

---

## Features ✨

### User Authentication & Authorization 🔐

- **Google Sign-In** and **Face ID login** for seamless access.
- **AI-generated secure passwords** for enhanced security.
- **Two-Factor Authentication (2FA)** for added protection.
- **Anomaly detection** in login attempts.
- Password reset with secure code sent via email.
- **Role-Based Access Control (RBAC)** supporting **Admin**, **Project Manager**, **Team Leader**, **Team Member**, and **Guest** roles.
- API endpoints for user management (CRUD operations).

### Project Management 📅

- **AI-driven project deadline prediction** for accurate planning.
- **Kanban board** for visualizing project workflows.
- **Project dashboard** with role-based access for tailored insights.
- **Project delay prediction** to proactively manage timelines.

### Task Management ✅

- **AI-based task priority prediction** to optimize workflows.
- **AI-driven task duration prediction** for better scheduling.
- **Project productivity graphs** based on task completion and performance.

### Dashboard & Smart Notifications 📬

- **SMS/Email notifications** with role-based access for relevant updates.
- **AI-driven task delay prediction** with automated member assignment or deadline adjustments.
- **Dashboard interface** with role-based access for customized views.
- **Calendar integration** for scheduling and tracking.
- **Report generation** with **PDF/Excel export** for project insights.

### Activity Log & History 📜

- **Anomaly detection in logs** for identifying suspicious activities.
- **User logs history** to track actions and contributions.
- **Performance scoring** based on project involvement and deadline adherence.
- **Automated badge assignments** for recognizing contributions (e.g., "Most Collaborative").
- **Skill extraction from CVs** and **AI-based project member recommendation system** for optimal team formation.

---

## Tech Stack 🛠️

### Frontend 🎨

- **React** ⚛️: For dynamic and responsive user interfaces.
- **JavaScript** 🌐: For client-side interactivity.

### Backend ⚙️

- **Python** 🐍: Core language for backend logic, enabling robust API development and integration with AI-driven features.
- **Node.js** 🚀: For handling real-time notification APIs.

### Database 💾

- **MongoDB** 🍃: For scalable, non-relational data storage, ideal for managing user data, project logs, and task records.

### CI/CD 🌟

- **Jenkins** 🛠️: Powers a robust CI/CD pipeline for automated testing, building, and deployment. The pipeline includes:
  - **Code Checkout**: Clones backend and frontend repositories from GitHub.
  - **Dependency Installation**: Installs dependencies for both backend and frontend in parallel.
  - **SonarQube Analysis**: Runs code quality checks with SonarQube to ensure maintainability and security.
  - **Unit Testing**: Executes backend unit tests with Jest, generating reports for validation.
  - **Frontend Build**: Builds the React frontend for production.
  - **Docker Deployment**: Builds and pushes Docker images to a Nexus repository for scalable deployment.
  - **Application Run**: Deploys the application using Docker Compose for seamless integration.
- **GitHub Actions** 🤖: Complements Jenkins for additional CI/CD automation, ensuring continuous integration.

---

## Directory Structure 📂

```
ProjectManagment_IA/
├── frontend/
│   ├── projectmanagement/     # React-based frontend code 🌟
│   │   ├── src/
│   │   │   ├── components/   # Reusable UI components (e.g., KanbanBoard, Dashboard) 🧩
│   │   │   │   ├── Auth/ 
│   │   │   │   ├── Layout/ 
│   │   │   │   ├── Pages/ 
│   │   │   ├── pages/        # Page-specific components (e.g., Login, TaskManagement) 📄
│   │   │   └── assets/       # Static assets (images, styles) 🖼️
│   │   └── public/           # Public assets 🌍
├── backend/      
│   │   ├── src/             # Flask-based backend code ⚙️
│   ├── controllers/                  # API endpoints for users, skills, notifications 🌐
│   ├── middleware/    
│   ├── models/         
│   ├── routes/   
│   ├── scripts/      # Backend logic for recommendations, anomaly detection 🧠
│   └── utils/                # Helper functions and scripts 🛠️
├──server.js
├── test/                   # CI/CD and deployment scripts 🚀
└── README.md                  # Project README 📝
```

---

## Getting Started 🏁

### Prerequisites ✅

- Python 3.8+ 🐍
- Node.js 16+ 🚀
- Docker and Docker Compose 🐳
- Twilio and SendGrid API keys 📱✉️
- Jenkins and SonarQube setup for CI/CD 🔍

### Installation 🛠️

1. Clone the repository:

   ```bash
   git clone https://github.com/yasminejamoussi/ProjectManagment_IA.git
   cd ProjectManagment_IA
   ```

2. Configure environment variables:

   - Create a `.env` file in the `backend/` directory.
   - Add Twilio, SendGrid, and MongoDB credentials (e.g., `MONGO_INITDB_ROOT_USERNAME=projectmanagement`, `MONGO_INITDB_ROOT_PASSWORD=project123`).

3. Build and run the services with Docker Compose:

   ```bash
   docker-compose up --build
   ```

   This sets up:

   - **API** 🌐: Backend service running on `http://localhost:4000`.
   - **Web** ⚛️: React frontend running on `http://localhost:5173`.
   - **MongoDB** 🍃: Primary database on `mongodb://localhost:27017`.
   - **MongoDB Test** 🧪: Test database on `mongodb://localhost:27018`.

### Usage 🎮

- Access the platform at `http://localhost:5173` 🌐.
- Log in using **Google Sign-In**, **Face ID**, or credentials with **2FA** 🔒.
- Use the **React-based dashboard** to manage projects, tasks, and users 📊.
- Visualize workflows with the **Kanban board** and track productivity via **graphs** 📈.
- Extract skills from CVs and receive **AI-driven team recommendations** 🤝.
- Configure **SMS/email notifications** and view **performance badges** 📩🏅.
- Monitor logs for anomalies and export reports in **PDF/Excel** 🛡️📄.

---

## Acknowledgments 🙌

- This project was completed under the guidance of [Professor Safa Saoudi](mailto:safa.saoudi@esprit.tn) at #Esprit_school_of_engineering.
- Heartfelt thanks to our amazing team: **Yasmine Jamoussi**, **Khalil Aloui**, **Ranime Sboui**, **Aloui Mustapha**, and **Mohamed Bizani** for their dedication and contributions! 💪
- Special gratitude to our professor, **Professor Safa Saoudi**, for her unwavering support, invaluable guidance, immense efforts, and trust in our abilities throughout this project at **“Esprit School of Engineering**. 🌟



