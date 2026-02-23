const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDER_SET = new Set(["male", "female", "other"]);

function createIssue(message, path) {
  return {
    success: false,
    error: {
      issues: [
        {
          message,
          path: path ? [path] : [],
        },
      ],
    },
  };
}

function createSuccess(data) {
  return {
    success: true,
    data,
  };
}

function asString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function trimString(value) {
  return asString(value).trim();
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(value);
}

function isBetweenLength(value, min, max) {
  return value.length >= min && value.length <= max;
}

export const loginSchema = {
  safeParse(input) {
    const email = trimString(input?.email);
    const password = asString(input?.password);

    if (!isValidEmail(email)) {
      return createIssue("Enter a valid email address.", "email");
    }
    if (!isBetweenLength(password, 8, 128)) {
      return createIssue("Password must be at least 8 characters.", "password");
    }
    return createSuccess({
      email,
      password,
    });
  },
};

export const registerSchema = {
  safeParse(input) {
    const username = trimString(input?.username);
    const email = trimString(input?.email);
    const password = asString(input?.password);
    const confirmPassword = asString(input?.confirmPassword);
    const gender = trimString(input?.gender);
    const agreeTerms = Boolean(input?.agreeTerms);

    if (!isBetweenLength(username, 3, 60)) {
      return createIssue("Username must be at least 3 characters.", "username");
    }
    if (!isValidEmail(email)) {
      return createIssue("Enter a valid email address.", "email");
    }
    if (!isBetweenLength(password, 8, 128)) {
      return createIssue("Password must be at least 8 characters.", "password");
    }
    if (!isBetweenLength(confirmPassword, 8, 128)) {
      return createIssue("Confirm password must be at least 8 characters.", "confirmPassword");
    }
    if (!GENDER_SET.has(gender)) {
      return createIssue("Select a valid gender option.", "gender");
    }
    if (!agreeTerms) {
      return createIssue("You must accept terms and privacy policy.", "agreeTerms");
    }
    if (password !== confirmPassword) {
      return createIssue("Passwords do not match.", "confirmPassword");
    }

    return createSuccess({
      username,
      email,
      password,
      confirmPassword,
      gender,
      agreeTerms,
    });
  },
};

export const otpSchema = {
  safeParse(input) {
    const otp = trimString(input);
    if (!/^\d{5}$/.test(otp)) {
      return createIssue("OTP should contain exactly 5 digits.", "otp");
    }
    return createSuccess(otp);
  },
};

export const resetAccountSchema = {
  safeParse(input) {
    const email = trimString(input?.email);
    const newPassword = asString(input?.newPassword);
    const confirmPassword = asString(input?.confirmPassword);

    if (!isValidEmail(email)) {
      return createIssue("Enter a valid email address.", "email");
    }
    if (!isBetweenLength(newPassword, 8, 128)) {
      return createIssue("New password must be at least 8 characters.", "newPassword");
    }
    if (!isBetweenLength(confirmPassword, 8, 128)) {
      return createIssue("Confirm password must be at least 8 characters.", "confirmPassword");
    }
    if (newPassword !== confirmPassword) {
      return createIssue("New password and confirm password must match.", "confirmPassword");
    }

    return createSuccess({
      email,
      newPassword,
      confirmPassword,
    });
  },
};

export const adminLoginSchema = {
  safeParse(input) {
    const username = trimString(input?.username);
    const password = asString(input?.password);

    if (!username) {
      return createIssue("Username is required.", "username");
    }
    if (!password) {
      return createIssue("Password is required.", "password");
    }
    if (!isBetweenLength(password, 1, 128)) {
      return createIssue("Password must be less than 128 characters.", "password");
    }
    return createSuccess({
      username,
      password,
    });
  },
};

export function firstSchemaError(parseResult, fallback = "Please review form fields.") {
  if (parseResult.success) return "";
  return parseResult.error?.issues?.[0]?.message || fallback;
}
