## Architecture Overview
This project is a full-stack web application. The frontend, a React application, resides in `src/` and serves as the user interface. It communicates with the backend, an Express.js server located in `server/`, which handles API requests, business logic, and data persistence. The backend interacts with a PostgreSQL database, managed through `server/db.js`.

Major subsystems include JWT-based authentication (`server/