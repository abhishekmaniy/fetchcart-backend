export const addOneMonth = (date: Date) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
};

export const getMonthlyPlanPeriod = (existingExpiresAt?: Date | null) => {
  const now = new Date();

  const hasActivePlan = Boolean(existingExpiresAt && existingExpiresAt > now);

  const baseDate = hasActivePlan ? existingExpiresAt! : now;

  return {
    startsAt: now,
    expiresAt: addOneMonth(baseDate),
  };
};

export const isPlanExpired = ({
  plan,
  expiresAt,
}: {
  plan: string;
  expiresAt?: Date | null;
}) => {
  if (plan === "FREE") return false;

  if (!expiresAt) return true;

  return expiresAt <= new Date();
};

export const getEffectivePlan = ({
  plan,
  expiresAt,
}: {
  plan?: string | null;
  expiresAt?: Date | null;
}) => {
  if (!plan || plan === "FREE") return "FREE";

  if (isPlanExpired({ plan, expiresAt })) {
    return "FREE";
  }

  return plan;
};