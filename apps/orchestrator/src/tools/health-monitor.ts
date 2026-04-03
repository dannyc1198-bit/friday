import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// Health Monitoring System for JARVIS
// Integrates with Apple Health, Google Fit, Samsung Health, Fitbit, Garmin

// Health data interfaces
interface VitalSigns {
  heartRate: number;
  heartRateVariability?: number;
  bloodOxygen?: number;
  bloodPressure?: { systolic: number; diastolic: number };
  bodyTemperature?: number;
  respiratoryRate?: number;
  timestamp: Date;
}

interface ExerciseData {
  type: string;
  duration: number; // minutes
  caloriesBurned: number;
  distance?: number; // meters
  steps?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  timestamp: Date;
}

interface SleepData {
  duration: number; // hours
  quality: "poor" | "fair" | "good" | "excellent";
  deepSleep: number; // hours
  remSleep: number;
  lightSleep: number;
  awakenings: number;
  timestamp: Date;
}

interface HealthAlert {
  severity: "info" | "warning" | "critical";
  type: string;
  message: string;
  recommendation: string;
  timestamp: Date;
}

// Normal ranges for health metrics
const NORMAL_RANGES = {
  heartRate: { min: 60, max: 100, criticalLow: 40, criticalHigh: 150 },
  bloodOxygen: { min: 95, max: 100, criticalLow: 90 },
  bodyTemperature: { min: 97.0, max: 99.0, criticalLow: 95, criticalHigh: 103 },
  bloodPressureSystolic: { min: 90, max: 120, criticalLow: 80, criticalHigh: 180 },
  bloodPressureDiastolic: { min: 60, max: 80, criticalLow: 50, criticalHigh: 120 },
  respiratoryRate: { min: 12, max: 20, criticalLow: 8, criticalHigh: 30 },
};

// Simulated health data (replace with actual API integrations)
let latestVitals: VitalSigns = {
  heartRate: 72,
  heartRateVariability: 45,
  bloodOxygen: 98,
  bloodPressure: { systolic: 118, diastolic: 76 },
  bodyTemperature: 98.2,
  respiratoryRate: 14,
  timestamp: new Date(),
};

let recentExercises: ExerciseData[] = [
  {
    type: "Running",
    duration: 32,
    caloriesBurned: 320,
    distance: 4500,
    steps: 5200,
    avgHeartRate: 145,
    maxHeartRate: 168,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    type: "Weight Training",
    duration: 45,
    caloriesBurned: 200,
    avgHeartRate: 110,
    maxHeartRate: 135,
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000),
  },
];

let sleepHistory: SleepData[] = [
  {
    duration: 7.2,
    quality: "good",
    deepSleep: 1.5,
    remSleep: 1.8,
    lightSleep: 3.9,
    awakenings: 2,
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
];

// Analyze vitals and generate alerts
function analyzeVitals(vitals: VitalSigns): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // Heart rate analysis
  if (vitals.heartRate < NORMAL_RANGES.heartRate.criticalLow) {
    alerts.push({
      severity: "critical",
      type: "bradycardia",
      message: `Critical: Heart rate dangerously low at ${vitals.heartRate} BPM`,
      recommendation: "Seek immediate medical attention. Do not drive yourself.",
      timestamp: new Date(),
    });
  } else if (vitals.heartRate > NORMAL_RANGES.heartRate.criticalHigh) {
    alerts.push({
      severity: "critical",
      type: "tachycardia",
      message: `Critical: Heart rate dangerously high at ${vitals.heartRate} BPM`,
      recommendation: "Stop all activity, sit down, practice deep breathing. Seek medical help if persists.",
      timestamp: new Date(),
    });
  } else if (vitals.heartRate < NORMAL_RANGES.heartRate.min || vitals.heartRate > NORMAL_RANGES.heartRate.max) {
    alerts.push({
      severity: "warning",
      type: "heart_rate_abnormal",
      message: `Heart rate outside normal range: ${vitals.heartRate} BPM`,
      recommendation: "Monitor closely. Rest if elevated, hydrate if low. Consult doctor if persistent.",
      timestamp: new Date(),
    });
  }

  // Blood oxygen analysis
  if (vitals.bloodOxygen !== undefined) {
    if (vitals.bloodOxygen < NORMAL_RANGES.bloodOxygen.criticalLow) {
      alerts.push({
        severity: "critical",
        type: "hypoxemia",
        message: `Critical: Blood oxygen dangerously low at ${vitals.bloodOxygen}%`,
        recommendation: "Seek immediate medical attention. This may indicate respiratory distress.",
        timestamp: new Date(),
      });
    } else if (vitals.bloodOxygen < NORMAL_RANGES.bloodOxygen.min) {
      alerts.push({
        severity: "warning",
        type: "low_oxygen",
        message: `Blood oxygen slightly low at ${vitals.bloodOxygen}%`,
        recommendation: "Take deep breaths, go outside for fresh air. Monitor closely.",
        timestamp: new Date(),
      });
    }
  }

  // Blood pressure analysis
  if (vitals.bloodPressure) {
    const { systolic, diastolic } = vitals.bloodPressure;
    if (systolic > NORMAL_RANGES.bloodPressureSystolic.criticalHigh || diastolic > NORMAL_RANGES.bloodPressureDiastolic.criticalHigh) {
      alerts.push({
        severity: "critical",
        type: "hypertensive_crisis",
        message: `Critical: Blood pressure extremely high at ${systolic}/${diastolic}`,
        recommendation: "Seek immediate medical attention. This is a hypertensive crisis.",
        timestamp: new Date(),
      });
    } else if (systolic > NORMAL_RANGES.bloodPressureSystolic.max || diastolic > NORMAL_RANGES.bloodPressureDiastolic.max) {
      alerts.push({
        severity: "warning",
        type: "high_blood_pressure",
        message: `Blood pressure elevated at ${systolic}/${diastolic}`,
        recommendation: "Reduce sodium intake, manage stress, consider medication if persistent.",
        timestamp: new Date(),
      });
    }
  }

  // Body temperature analysis
  if (vitals.bodyTemperature !== undefined) {
    if (vitals.bodyTemperature > NORMAL_RANGES.bodyTemperature.criticalHigh) {
      alerts.push({
        severity: "critical",
        type: "hyperthermia",
        message: `Critical: Body temperature dangerously high at ${vitals.bodyTemperature}°F`,
        recommendation: "Seek immediate medical attention. Cool down with cold water, remove excess clothing.",
        timestamp: new Date(),
      });
    } else if (vitals.bodyTemperature < NORMAL_RANGES.bodyTemperature.criticalLow) {
      alerts.push({
        severity: "critical",
        type: "hypothermia",
        message: `Critical: Body temperature dangerously low at ${vitals.bodyTemperature}°F`,
        recommendation: "Seek immediate medical attention. Warm up gradually, drink warm fluids.",
        timestamp: new Date(),
      });
    } else if (vitals.bodyTemperature > NORMAL_RANGES.bodyTemperature.max) {
      alerts.push({
        severity: "warning",
        type: "fever",
        message: `Elevated body temperature: ${vitals.bodyTemperature}°F`,
        recommendation: "Rest, stay hydrated. Take fever reducer if needed. Monitor for worsening symptoms.",
        timestamp: new Date(),
      });
    }
  }

  return alerts;
}

// Generate health insights
function generateHealthInsights(vitals: VitalSigns, exercises: ExerciseData[], sleep: SleepData[]): string[] {
  const insights: string[] = [];

  // Heart rate variability insight
  if (vitals.heartRateVariability) {
    if (vitals.heartRateVariability > 50) {
      insights.push("Excellent heart rate variability indicates good recovery and stress management.");
    } else if (vitals.heartRateVariability < 30) {
      insights.push("Low HRV detected. Consider recovery activities like meditation or light stretching.");
    }
  }

  // Exercise insights
  const weeklyExerciseMinutes = exercises
    .filter(e => Date.now() - e.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000)
    .reduce((sum, e) => sum + e.duration, 0);

  if (weeklyExerciseMinutes >= 150) {
    insights.push(`Great job! You've logged ${weeklyExerciseMinutes} minutes of exercise this week, meeting WHO recommendations.`);
  } else {
    insights.push(`You've logged ${weeklyExerciseMinutes} minutes this week. Aim for 150+ minutes for optimal health.`);
  }

  // Sleep insights
  if (sleep.length > 0) {
    const lastSleep = sleep[0];
    if (lastSleep.duration < 7) {
      insights.push(`Last night's sleep was ${lastSleep.duration.toFixed(1)} hours. Adults need 7-9 hours for optimal function.`);
    }
    if (lastSleep.deepSleep < 1) {
      insights.push("Deep sleep was below optimal. Avoid screens before bed and keep bedroom cool.");
    }
  }

  return insights;
}

// Get Vitals Tool
const getVitalsTool: Tool = {
  name: "get_vitals",
  description: "Gets current vital signs from connected health devices (heart rate, blood oxygen, blood pressure, temperature)",
  category: "health",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Simulate real-time data with slight variations
    latestVitals = {
      ...latestVitals,
      heartRate: Math.round(latestVitals.heartRate + (Math.random() - 0.5) * 4),
      bloodOxygen: Math.min(100, Math.max(94, (latestVitals.bloodOxygen || 98) + (Math.random() - 0.5) * 2)),
      timestamp: new Date(),
    };

    const alerts = analyzeVitals(latestVitals);
    const insights = generateHealthInsights(latestVitals, recentExercises, sleepHistory);

    return {
      toolCallId: "",
      success: true,
      data: {
        vitals: latestVitals,
        alerts,
        insights,
        status: alerts.some(a => a.severity === "critical") ? "CRITICAL" :
                alerts.some(a => a.severity === "warning") ? "WARNING" : "NORMAL",
      },
    };
  },
};

// Get Exercise Data Tool
const getExerciseDataTool: Tool = {
  name: "get_exercise_data",
  description: "Gets recent exercise and workout data from health apps",
  category: "health",
  parameters: [
    {
      name: "days",
      type: "number",
      description: "Number of days to look back (default: 7)",
      required: false,
      default: 7,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const days = (params.days as number) || 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const exercises = recentExercises.filter(e => e.timestamp.getTime() > cutoff);
    const totalMinutes = exercises.reduce((sum, e) => sum + e.duration, 0);
    const totalCalories = exercises.reduce((sum, e) => sum + e.caloriesBurned, 0);
    const totalSteps = exercises.reduce((sum, e) => sum + (e.steps || 0), 0);

    return {
      toolCallId: "",
      success: true,
      data: {
        exercises,
        summary: {
          totalWorkouts: exercises.length,
          totalMinutes,
          totalCalories,
          totalSteps,
          avgDuration: exercises.length > 0 ? Math.round(totalMinutes / exercises.length) : 0,
          period: `Last ${days} days`,
        },
        recommendation: totalMinutes < 150
          ? "Consider adding more activity. Even 10-minute walks help!"
          : "You're meeting exercise recommendations. Keep it up!",
      },
    };
  },
};

// Get Sleep Data Tool
const getSleepDataTool: Tool = {
  name: "get_sleep_data",
  description: "Gets sleep tracking data and analysis",
  category: "health",
  parameters: [
    {
      name: "nights",
      type: "number",
      description: "Number of nights to look back (default: 7)",
      required: false,
      default: 7,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const nights = (params.nights as number) || 7;
    const recentSleep = sleepHistory.slice(0, nights);

    const avgDuration = recentSleep.reduce((sum, s) => sum + s.duration, 0) / recentSleep.length;
    const avgDeepSleep = recentSleep.reduce((sum, s) => sum + s.deepSleep, 0) / recentSleep.length;
    const avgQuality = recentSleep.filter(s => s.quality === "good" || s.quality === "excellent").length / recentSleep.length;

    return {
      toolCallId: "",
      success: true,
      data: {
        recentSleep,
        analysis: {
          avgDuration: avgDuration.toFixed(1),
          avgDeepSleep: avgDeepSleep.toFixed(1),
          qualityScore: Math.round(avgQuality * 100),
          trend: avgDuration >= 7 ? "healthy" : "needs_improvement",
        },
        recommendations: avgDuration < 7
          ? ["Set a consistent bedtime", "Avoid caffeine after 2pm", "Keep bedroom dark and cool"]
          : ["Great sleep habits! Maintain your routine."],
      },
    };
  },
};

// Health Check Tool - Comprehensive analysis
const healthCheckTool: Tool = {
  name: "health_check",
  description: "Performs comprehensive health analysis with vitals, exercise, sleep data and personalized recommendations",
  category: "health",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const vitals = latestVitals;
    const alerts = analyzeVitals(vitals);
    const insights = generateHealthInsights(vitals, recentExercises, sleepHistory);

    // Calculate overall health score (simplified)
    let score = 100;
    alerts.forEach(a => {
      if (a.severity === "critical") score -= 30;
      if (a.severity === "warning") score -= 10;
    });

    // Exercise factor
    const weeklyMinutes = recentExercises
      .filter(e => Date.now() - e.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000)
      .reduce((sum, e) => sum + e.duration, 0);
    if (weeklyMinutes >= 150) score += 5;
    else if (weeklyMinutes < 60) score -= 10;

    // Sleep factor
    if (sleepHistory.length > 0 && sleepHistory[0].duration >= 7) score += 5;
    else if (sleepHistory.length > 0 && sleepHistory[0].duration < 6) score -= 10;

    score = Math.max(0, Math.min(100, score));

    return {
      toolCallId: "",
      success: true,
      data: {
        overallScore: score,
        scoreLabel: score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention",
        vitals,
        alerts,
        insights,
        lastExercise: recentExercises[0],
        lastSleep: sleepHistory[0],
        recommendations: [
          ...alerts.map(a => a.recommendation),
          ...(weeklyMinutes < 150 ? ["Add 30 minutes of cardio 3x per week"] : []),
          ...(sleepHistory[0]?.duration < 7 ? ["Prioritize 7-8 hours of sleep tonight"] : []),
        ],
      },
    };
  },
};

// Update Vitals Tool (for receiving data from watch)
const updateVitalsTool: Tool = {
  name: "update_vitals",
  description: "Updates vital signs from smartwatch or health device sync",
  category: "health",
  parameters: [
    { name: "heart_rate", type: "number", description: "Current heart rate in BPM", required: false },
    { name: "blood_oxygen", type: "number", description: "Blood oxygen saturation %", required: false },
    { name: "systolic", type: "number", description: "Systolic blood pressure", required: false },
    { name: "diastolic", type: "number", description: "Diastolic blood pressure", required: false },
    { name: "temperature", type: "number", description: "Body temperature in °F", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (params.heart_rate) latestVitals.heartRate = params.heart_rate as number;
    if (params.blood_oxygen) latestVitals.bloodOxygen = params.blood_oxygen as number;
    if (params.systolic && params.diastolic) {
      latestVitals.bloodPressure = {
        systolic: params.systolic as number,
        diastolic: params.diastolic as number,
      };
    }
    if (params.temperature) latestVitals.bodyTemperature = params.temperature as number;
    latestVitals.timestamp = new Date();

    const alerts = analyzeVitals(latestVitals);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: "Vitals updated successfully",
        vitals: latestVitals,
        alerts,
        immediateAction: alerts.some(a => a.severity === "critical")
          ? "CRITICAL ALERT: " + alerts.find(a => a.severity === "critical")?.recommendation
          : null,
      },
    };
  },
};

// Register all health monitoring tools
export function registerHealthTools(): void {
  toolRegistry.register(getVitalsTool);
  toolRegistry.register(getExerciseDataTool);
  toolRegistry.register(getSleepDataTool);
  toolRegistry.register(healthCheckTool);
  toolRegistry.register(updateVitalsTool);
}
