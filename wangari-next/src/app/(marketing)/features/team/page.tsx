"use client";

import { Users } from "lucide-react";
import { FeaturePage } from "@/components/feature-page";

export default function TeamFeaturePage() {
  return (
    <FeaturePage
      icon={Users}
      badge="Team Management"
      title="Manage your team from one place"
      subtitle="Track attendance, assign tasks, manage wages, and keep your workers accountable — all from your phone."
      description="Wangari's team management module helps you run your farm like a professional operation. Track who's working, what they've done, and how much they've earned. Assign tasks, monitor attendance, and ensure every worker is contributing to your farm's success."
      highlights={[
        "Digital attendance tracking with GPS verification",
        "Task assignment and completion tracking",
        "Automated wage calculations based on hours or tasks",
        "Worker performance scores and history",
        "Shift scheduling with automatic reminders",
        "Photo evidence for completed tasks",
        "Worker profiles with skills and certifications",
        "Payroll reports for tax and compliance purposes",
      ]}
      capabilities={[
        { title: "Attendance System", desc: "Workers clock in and out with their phones. GPS verifies they're on-site. See real-time who's working, who's late, and who's absent. No more paper timesheets." },
        { title: "Task Management", desc: "Create and assign tasks with deadlines and priority levels. Workers receive notifications and mark tasks complete with photo evidence. Track task completion rates over time." },
        { title: "Wage Calculator", desc: "Set hourly rates, daily rates, or piece-work rates. Wangari automatically calculates wages based on attendance and tasks completed. Generate pay slips and payment records." },
        { title: "Performance Tracking", desc: "Score workers based on attendance, task completion, and quality of work. Identify top performers for bonuses and underperformers who need training." },
        { title: "Shift Scheduler", desc: "Plan weekly and monthly shifts. Workers get their schedules in advance with automatic reminders. Handle shift swaps and overtime tracking effortlessly." },
        { title: "Compliance Reports", desc: "Generate payroll reports for tax filing, NHIF, and NSSF contributions. Keep your farm compliant with Kenyan labor laws without the paperwork headache." },
      ]}
                  farmerExperience={{
        heading: "Payday without the arguments",
        steps: [
          { title: "7:00 AM — workers clock in with their phones", desc: "Each worker taps in on their own device. GPS confirms they're actually at the farm. The paper timesheet — and its creative arithmetic — is gone." },
          { title: "Tasks assigned before you've had chai", desc: "'Michael — deworm flock B. Grace — collect and grade eggs.' Each worker sees their task on their phone, marks it done with photo proof." },
          { title: "Their phones work offline too", desc: "A worker logging attendance or completing a task at the far end of the shamba with no signal? It saves on their device and syncs when they walk back into coverage." },
          { title: "End of month — wages computed themselves", desc: "Days worked, tasks completed, any advances — all recorded as it happened. Open the worker profile: the amount to pay is already there, with the full history behind it." },
          { title: "Everyone sees their own record", desc: "Workers check their hours and earnings anytime. Transparency ends the disputes before they start — and good workers finally get visible credit." },
        ],
      }}
    />
  );
}
