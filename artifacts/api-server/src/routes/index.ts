import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import coursesRouter from "./courses";
import lessonsRouter from "./lessons";
import enrollmentsRouter from "./enrollments";
import liveClassesRouter from "./live-classes";
import attendanceRouter from "./attendance";
import communityRouter from "./community";
import tradingRouter from "./trading";
import dashboardRouter from "./dashboard";
import assessmentsRouter from "./assessments";
import engagementRouter from "./engagement";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(coursesRouter);
router.use(lessonsRouter);
router.use(enrollmentsRouter);
router.use(liveClassesRouter);
router.use(attendanceRouter);
router.use(communityRouter);
router.use(tradingRouter);
router.use(dashboardRouter);
router.use(assessmentsRouter);
router.use(engagementRouter);

export default router;
