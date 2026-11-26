import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { AUTH_EMAIL_DOMAIN } from "../../assets/js/auth-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const allowedRoles = new Set([
  "owner",
  "it_admin",
  "gm",
  "chief_accountant",
  "branch_manager_accountant",
  "branch_manager",
  "branch_accountant",
  "employee"
]);
const allowedBranches = new Set([
  "ajman",
  "abudhabi",
  "ain",
  "muscat",
  "yemen",
  "all",
  "unassigned"
]);

function readArguments(argv) {
  const options = new Map();
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--help") {
      return { help: true };
    }
    if (!["--input", "--credentials-output"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options.set(argument, value);
    index += 1;
  }
  return {
    apply,
    input: options.get("--input"),
    credentialsOutput: options.get("--credentials-output")
  };
}

function printHelp() {
  console.log([
    "Validate imported user profiles (no cloud changes):",
    "  npm run import-users -- --input <users-export.json>",
    "",
    "Create/reset Firebase Auth accounts and profiles:",
    "  npm run import-users -- --input <users-export.json> --credentials-output <outside-repo.json> --apply"
  ].join("\n"));
}

function loadProjectId() {
  const firebaseRcPath = join(repositoryRoot, ".firebaserc");
  const firebaseRc = JSON.parse(readFileSync(firebaseRcPath, "utf8"));
  const projectId = firebaseRc.projects?.default;
  if (!projectId) {
    throw new Error("No default Firebase project is configured in .firebaserc.");
  }
  return projectId;
}

function validateUsers(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("The input must be a JSON object keyed by username.");
  }
  const users = Object.entries(source).map(([username, record]) => {
    if (!/^[a-z0-9_-]{1,64}$/.test(username)) {
      throw new Error(`Invalid username key: ${username}`);
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Invalid user record for ${username}.`);
    }
    if (String(record.username || username).toLowerCase() !== username) {
      throw new Error(`The username field does not match the key for ${username}.`);
    }
    if (!allowedRoles.has(record.role)) {
      throw new Error(`Unsupported role for ${username}.`);
    }
    if (!allowedBranches.has(record.branchId)) {
      throw new Error(`Unsupported branch for ${username}.`);
    }
    if (typeof record.active !== "boolean") {
      throw new Error(`The active field must be boolean for ${username}.`);
    }
    const authEmail = `${username}@${AUTH_EMAIL_DOMAIN}`;
    const profile = {
      fullName: String(record.fullName || record.username || username),
      username,
      role: record.role,
      branchId: record.branchId,
      active: record.active,
      hidden: record.hidden === true,
      phone: String(record.phone || ""),
      email: String(record.email || "").trim().toLowerCase()
    };
    return { username, authEmail, profile };
  });
  if (!users.length) {
    throw new Error("No user records were found.");
  }
  return users;
}

function ensureCredentialsPathIsSafe(path) {
  const relativePath = relative(repositoryRoot, path);
  if (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  ) {
    throw new Error("The credentials report must be saved outside the repository.");
  }
  if (existsSync(path)) {
    throw new Error("The credentials report already exists; choose a new path.");
  }
}

async function findAuthUser(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function findAuthUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function run() {
  const options = readArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.input) {
    throw new Error("Provide an input JSON path with --input.");
  }

  const projectId = loadProjectId();
  const source = JSON.parse(readFileSync(resolve(options.input), "utf8"));
  const users = validateUsers(source);

  if (!options.apply) {
    console.log(`Validated ${users.length} user profiles for Firebase project ${projectId}. No cloud changes were made.`);
    console.log("Add --apply and --credentials-output outside the repository to create/reset accounts.");
    return;
  }
  if (!options.credentialsOutput) {
    throw new Error("--credentials-output is required with --apply.");
  }
  const credentialsOutput = resolve(options.credentialsOutput);
  ensureCredentialsPathIsSafe(credentialsOutput);

  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
    databaseURL: process.env.FIREBASE_DATABASE_URL
      || `https://${projectId}-default-rtdb.firebaseio.com`
  });
  const auth = getAuth(app);
  const database = getDatabase(app);

  const existingAccounts = new Map();
  for (const user of users) {
    const existing = await findAuthUser(auth, user.username);
    const profileSnapshot = await database.ref(`users/${user.username}`).get();
    const existingProfile = profileSnapshot.val();
    if (existingProfile && existingProfile.username !== user.username) {
      throw new Error(`A different profile already uses the UID ${user.username}.`);
    }
    if (
      existing
      && existing.email !== user.authEmail
      && existing.customClaims?.usernameLogin !== true
    ) {
      throw new Error(`The existing Auth account ${user.username} is not marked as a username-login account.`);
    }
    const emailOwner = await findAuthUserByEmail(auth, user.authEmail);
    if (emailOwner && emailOwner.uid !== user.username) {
      throw new Error(`The generated Auth email for ${user.username} is already assigned to another account.`);
    }
    existingAccounts.set(user.username, existing);
  }

  const credentials = users.map(user => ({
    username: user.username,
    temporaryPassword: randomBytes(24).toString("hex")
  }));
  await writeFile(
    credentialsOutput,
    `${JSON.stringify(credentials, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 }
  );

  try {
    for (let index = 0; index < users.length; index += 1) {
      const user = users[index];
      const existing = existingAccounts.get(user.username);
      const accountOptions = {
        email: user.authEmail,
        emailVerified: true,
        password: credentials[index].temporaryPassword,
        displayName: user.profile.fullName,
        disabled: false
      };
      if (existing) {
        await auth.updateUser(user.username, accountOptions);
        await auth.setCustomUserClaims(user.username, { usernameLogin: true });
      } else {
        await auth.createUser({ uid: user.username, ...accountOptions });
        await auth.setCustomUserClaims(user.username, { usernameLogin: true });
      }
      await database.ref(`users/${user.username}`).set(user.profile);
    }
  } catch (error) {
    throw new Error(
      `Migration stopped after a partial update. Keep the protected credentials report for recovery. ${error.message}`
    );
  }

  console.log(`Created/reset ${users.length} accounts in Firebase project ${projectId}.`);
  console.log(`Temporary credentials were saved outside the repository at: ${credentialsOutput}`);
  console.log("Distribute the credentials privately and ask users to change their passwords after sign-in.");
}

run().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
