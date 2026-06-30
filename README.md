# Tennis Booking Backend Migration: Google Sheets to Supabase

This repository contains the backend configuration, database migrations, Deno Edge Functions, and CI/CD pipelines to migrate the backend of **The Grand Slam Tennis Court** booking system from Google Sheets/Apps Script to Supabase.

---

## 📁 Repository Structure

* `.github/workflows/supabase-deploy.yml`: GitHub Actions pipeline to automatically deploy database changes and Edge Functions.
* `supabase/config.toml`: CLI local development environment settings.
* `supabase/migrations/20260624000000_init.sql`: SQL script to initialize DB tables (`bookings`, `transactions`), RLS security policies, and the `slips` storage bucket.
* `supabase/functions/send-booking-email/`: Deno Edge Function to send confirmation emails via the Resend API when bookings are created.
* `supabase/functions/line-reminder/`: Deno Edge Function to check tomorrow's bookings and send reminders to customers via LINE Messaging API.
* `app_supabase.js`: JavaScript reference code demonstrating how to update your frontend (`app.js`) to connect to Supabase.

---

## 🚀 Step 1: Initial Local Setup & Supabase CLI

1. **Install Supabase CLI** (if not already installed):
   * **Windows** (PowerShell):
     ```powershell
     scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
     scoop install supabase
     ```
     *Or using npm:*
     ```bash
     npm install -g supabase
     ```
2. **Login to your Supabase Account**:
   ```bash
   supabase login
   ```
3. **Link to your Remote Supabase Project**:
   Get your **Project Reference ID** from the Supabase Dashboard URL (e.g. `https://supabase.com/dashboard/project/<project-ref>`).
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
   *(You will be prompted to enter your database password)*

---

## 🛠️ Step 2: Deploying Database Migrations & Storage

Apply the migrations to create the database tables (`bookings`, `transactions`), unique slot keys, RLS security policies, and the `slips` storage bucket:

```bash
supabase db push
```

---

## ✉️ Step 3: Configure Booking Confirmation Email (Resend)

To send emails automatically when a booking is created, we use a database webhook pointing to the `send-booking-email` Edge Function:

### 1. Set environment variables on Supabase
Get a free API key from [Resend](https://resend.com) and set it in your Supabase project:
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
```

### 2. Deploy the Edge Function
```bash
supabase functions deploy send-booking-email
```

### 3. Create a Database Webhook in the Dashboard
1. Go to your **Supabase Dashboard** -> **Database** -> **Webhooks**.
2. Click **Enable Webhooks** (if not enabled).
3. Click **Create Webhook**:
   * **Name**: `send-booking-email`
   * **Table**: `bookings`
   * **Events**: Check `Insert`
   * **Type**: `Supabase Edge Function`
   * **Edge Function**: Select `send-booking-email`
   * **Method**: `POST`
4. Click **Save**.

---

## 💬 Step 4: Configure Daily LINE Notification Reminders

To send reminders to customers 1 day before their booking:

### 1. Set LINE Token in Supabase
Set your LINE Messaging Channel Access Token:
```bash
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
```

### 2. Deploy the Edge Function
```bash
supabase functions deploy line-reminder
```

### 3. Set up the Daily Cron Trigger in PostgreSQL
You can schedule the Deno Edge Function to run automatically every day at 8:00 AM using `pg_cron` inside your Supabase Database:

1. In the **Supabase Dashboard**, go to the **SQL Editor**.
2. Run the following SQL statement (this activates `pg_cron` and schedules a daily HTTP request to trigger your Edge Function):
   ```sql
   -- Enable pg_cron and pg_net extensions
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;

   -- Schedule cron job to run daily at 8:00 AM Bangkok Time (01:00 UTC)
   SELECT cron.schedule(
     'daily-line-reminder',
     '0 1 * * *',
     $$
     SELECT net.http_post(
       url := 'https://<your-project-ref>.supabase.co/functions/v1/line-reminder',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <YOUR_SUPABASE_ANON_KEY>'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   *(Be sure to replace `<your-project-ref>` and `<YOUR_SUPABASE_ANON_KEY>` with your actual project credentials.)*

---

## 🔗 Step 5: Connecting to GitHub for CI/CD Auto-Deployment

To automatically deploy your schema migrations and Edge Functions when you push to GitHub:

1. Create a GitHub repository and push this project's code.
2. In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**.
3. Create the following **Repository Secrets**:
   * `SUPABASE_PROJECT_ID`: Your project's reference ID (e.g., `abcdefghijklmnopqr`).
   * `SUPABASE_ACCESS_TOKEN`: Create one at [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens).
   * `SUPABASE_DB_PASSWORD`: The database password you chose when creating the project.

Now, whenever you push code to the `main` branch, GitHub Actions will automatically link, migrate database schemas, and deploy your edge functions!

---

## 💻 Local Development

Run Supabase locally for testing before pushing changes to production:

```bash
# Start local Supabase container environment
supabase start

# Run Edge Functions locally for debugging
supabase functions serve
```
