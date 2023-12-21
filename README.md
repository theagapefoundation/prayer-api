# Prayer API

Welcome to the official repository for the Prayer App API Server. This server is the backbone of our open-source prayer-sharing application, ["Prayer"](https://github.com/theagapefoundation/prayer), designed to foster a community of love and support as users share and pray for one another. Built with NestJS, this robust API server leverages Kysely for query building, Sentry for error reporting, and PostgreSQL as its database.

## Features

- **User Authentication**: Securely manage user sessions and protect personal data.
- **Prayer Requests**: Allow users to post, view, and manage their prayer requests.
- **Community Interactions**: Users can commit to pray for others, creating a supportive network.
- **Error Reporting**: Integrated Sentry for real-time error tracking and alerts.

## Getting Started

### Prerequisites

- Node.js
- PostgreSQL database
- Sentry account for error reporting

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/theagapefoundation/prayer-api.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd prayer-api
   ```

3. **Install dependencies:**

   ```bash
   yarn install
   ```

4. **Set up environment variables:**

   Create a `.env` file in the root directory and provide the necessary environment variables:

   ```plaintext
   DATABASE_URL=postgresql://username:password@localhost:port/dbname
   SENTRY_DSN=your_sentry_dsn
   ```

### Running the Server

Run the server in development mode:

```bash
yarn run start:dev
```

## API Endpoints

Documentation for API endpoints will be available once the server is running, typically at: http://localhost:3000/

## Query Builder: Kysely

Kysely is used for building SQL queries in a safe and efficient manner. It provides a fluent API to construct queries programmatically and helps prevent SQL injection.

## Database: PostgreSQL

This API server is configured to use PostgreSQL, a powerful open-source relational database. Ensure your PostgreSQL instance is running and accessible via the credentials provided in your `.env` file.

## Contribution

We welcome contributions to improve the Prayer API! Please feel free to fork the repository, make your changes, and submit a pull request.

## Support

If you encounter any issues or require assistance, please [open an issue](https://github.com/theagapefoundation/prayer-api/issues) on the GitHub repository.

## License

This project is licensed under the [MIT](LICENSE).

---

Thank you for being a part of the Prayer community. Your contribution helps in spreading love and support through the power of prayer.