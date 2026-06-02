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

export default router;
